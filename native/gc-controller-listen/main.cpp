// gc-controller-listen — escucha el botón de captura de los mandos y escribe una línea `capture`
// por stdout en cada pulsación. GameClip lo arranca cuando el ajuste "botón de captura de mandos"
// está activo y traduce cada `capture` en un guardado de clip. Ver spec/work/feature-boton-captura-mandos.
//
// Dos vías en paralelo:
//
//   - HID crudo para el botón Create/Share del DualSense (VID 054C, PID 0CE6/0DF2), USB y BT.
//   - GameInput para el botón Compartir del mando de Xbox (system button "Share"), USB y BT. Requiere
//     el runtime de GameInput (GameInputRedist.dll); si no está, esta vía queda inactiva y la de HID
//     sigue. Clave: SetFocusPolicy(EnableBackgroundShareButton) para recibir el botón sin foco.
//
// Persistente y event-driven: la vía HID espera en los handles de lectura con re-escaneo periódico
// para hotplug; la vía GameInput entrega el callback en su propio hilo. Bloquea leyendo stdin: cuando
// el padre cierra el pipe (o muere) llega EOF y el proceso sale (sin quedar huérfano). Devuelve 0.

#include <windows.h>

#include <setupapi.h>
#include <hidsdi.h>
#include <hidpi.h>

#include <cstdint>
#include <cstdio>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

// Rellenos por si el sal.h de MinGW no define alguna anotación del header de GameInput.
#ifndef _COM_Outptr_
#define _COM_Outptr_
#endif
#ifndef _Result_zeroonfailure_
#define _Result_zeroonfailure_
#endif

#include "GameInput.h"

using namespace GameInput::v3;

namespace {

// ------------------------------------------------------------------------------------------------
// Emisión (thread-safe): la vía HID (hilo principal) y GameInput (hilo propio) escriben stdout.
// ------------------------------------------------------------------------------------------------

std::mutex g_outMutex;

void emitCapture() {
  std::lock_guard<std::mutex> lock(g_outMutex);
  fputs("capture\n", stdout);
  fflush(stdout);
}

// Evento de parada global: lo señala el hilo de stdin al recibir EOF.
HANDLE g_stopEvent = nullptr;

// ------------------------------------------------------------------------------------------------
// Vía HID — DualSense (botón Create)
// ------------------------------------------------------------------------------------------------

constexpr USHORT kSonyVid = 0x054C;
constexpr USHORT kDualSensePid = 0x0CE6;
constexpr USHORT kDualSenseEdgePid = 0x0DF2;

bool isDualSense(const HIDD_ATTRIBUTES& attr) {
  return attr.VendorID == kSonyVid &&
         (attr.ProductID == kDualSensePid || attr.ProductID == kDualSenseEdgePid);
}

// ¿Está pulsado el botón Create en este input report? Máscara 0x10 del byte de botones, cuya
// posición depende del tipo de report: USB full (id 0x01, 64B) byte 9; BT full (id 0x31) byte 10;
// BT "simple" (id 0x01 corto) byte 6. Los offsets se verifican contra el mando real.
bool createPressed(const BYTE* buf, DWORD len) {
  if (len < 7) return false;
  const BYTE id = buf[0];
  if (id == 0x01) {
    if (len >= 64) return (buf[9] & 0x10) != 0;   // USB full
    return (buf[6] & 0x10) != 0;                  // BT simple (compat DS4)
  }
  if (id == 0x31 && len >= 11) return (buf[10] & 0x10) != 0;  // BT full
  return false;
}

struct HidDevice {
  HANDLE handle = INVALID_HANDLE_VALUE;
  OVERLAPPED ov{};
  std::vector<BYTE> buf;
  DWORD reportLen = 0;
  bool prevCreate = false;
  std::wstring path;
};

// (Re)arma una lectura solapada. false si el device murió (el llamador lo cierra y lo quita).
bool startRead(HidDevice& dev) {
  ResetEvent(dev.ov.hEvent);
  if (ReadFile(dev.handle, dev.buf.data(), dev.reportLen, nullptr, &dev.ov)) return true;
  return GetLastError() == ERROR_IO_PENDING;
}

// Abre un DualSense por su device path y prepara la primera lectura. null → no es DualSense o falló.
HidDevice* openDualSense(const std::wstring& path) {
  HANDLE h = CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE,
                         FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
                         FILE_FLAG_OVERLAPPED, nullptr);
  if (h == INVALID_HANDLE_VALUE) {
    // Reintento solo lectura: puede que otra app lo tenga abierto sin compartir escritura.
    h = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                    OPEN_EXISTING, FILE_FLAG_OVERLAPPED, nullptr);
  }
  if (h == INVALID_HANDLE_VALUE) return nullptr;

  HIDD_ATTRIBUTES attr{};
  attr.Size = sizeof(attr);
  if (!HidD_GetAttributes(h, &attr) || !isDualSense(attr)) {
    CloseHandle(h);
    return nullptr;
  }

  PHIDP_PREPARSED_DATA pp = nullptr;
  USHORT inputLen = 0;
  if (HidD_GetPreparsedData(h, &pp)) {
    HIDP_CAPS caps{};
    if (HidP_GetCaps(pp, &caps) == HIDP_STATUS_SUCCESS) inputLen = caps.InputReportByteLength;
    HidD_FreePreparsedData(pp);
  }
  if (inputLen == 0) inputLen = 78;  // fallback: cabe el report BT completo

  // Pide el feature report 0x05 (calibración): por BT conmuta al report completo 0x31; por USB es
  // inocuo. Sin esto, por BT el mando puede quedarse en el report simple.
  BYTE feature[64] = {0x05};
  HidD_GetFeature(h, feature, sizeof(feature));

  auto* dev = new HidDevice();
  dev->handle = h;
  dev->buf.assign(inputLen, 0);
  dev->reportLen = inputLen;
  dev->path = path;
  dev->ov.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);  // manual-reset
  if (!startRead(*dev)) {
    CloseHandle(dev->ov.hEvent);
    CloseHandle(h);
    delete dev;
    return nullptr;
  }
  return dev;
}

void closeDevice(HidDevice* dev) {
  if (!dev) return;
  CancelIoEx(dev->handle, &dev->ov);
  if (dev->ov.hEvent) CloseHandle(dev->ov.hEvent);
  if (dev->handle != INVALID_HANDLE_VALUE) CloseHandle(dev->handle);
  delete dev;
}

// Enumera DualSense conectados y abre los que aún no estén en `open` (por device path).
void rescan(std::vector<HidDevice*>& open, std::set<std::wstring>& openPaths) {
  GUID hidGuid;
  HidD_GetHidGuid(&hidGuid);
  HDEVINFO info =
      SetupDiGetClassDevsW(&hidGuid, nullptr, nullptr, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
  if (info == INVALID_HANDLE_VALUE) return;

  SP_DEVICE_INTERFACE_DATA ifData{};
  ifData.cbSize = sizeof(ifData);
  for (DWORD i = 0; SetupDiEnumDeviceInterfaces(info, nullptr, &hidGuid, i, &ifData); ++i) {
    DWORD needed = 0;
    SetupDiGetDeviceInterfaceDetailW(info, &ifData, nullptr, 0, &needed, nullptr);
    if (needed == 0) continue;
    std::vector<BYTE> detailBuf(needed);
    auto* detail = reinterpret_cast<PSP_DEVICE_INTERFACE_DETAIL_DATA_W>(detailBuf.data());
    detail->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W);
    if (!SetupDiGetDeviceInterfaceDetailW(info, &ifData, detail, needed, nullptr, nullptr)) continue;

    std::wstring path = detail->DevicePath;
    if (openPaths.count(path)) continue;  // ya abierto
    if (HidDevice* dev = openDualSense(path)) {
      open.push_back(dev);
      openPaths.insert(path);
    }
  }
  SetupDiDestroyDeviceInfoList(info);
}

// Bucle de lectura HID: espera en los eventos de todos los DualSense + el stopEvent, con timeout
// corto que dispara re-escaneo (hotplug). Corre en el hilo principal hasta que se señala stopEvent.
void runHidLoop() {
  std::vector<HidDevice*> open;
  std::set<std::wstring> openPaths;
  rescan(open, openPaths);

  for (;;) {
    std::vector<HANDLE> waits;
    waits.push_back(g_stopEvent);
    for (auto* dev : open) waits.push_back(dev->ov.hEvent);
    // WaitForMultipleObjects tope 64 handles; con 63 mandos ya es absurdo, pero acotamos por si acaso.
    const DWORD count = static_cast<DWORD>(waits.size() > MAXIMUM_WAIT_OBJECTS
                                               ? MAXIMUM_WAIT_OBJECTS
                                               : waits.size());
    const DWORD r = WaitForMultipleObjects(count, waits.data(), FALSE, 2000);

    if (r == WAIT_OBJECT_0) break;  // stop
    if (r == WAIT_TIMEOUT) {
      rescan(open, openPaths);
      continue;
    }
    if (r < WAIT_OBJECT_0 + 1 || r >= WAIT_OBJECT_0 + count) continue;

    const size_t idx = r - WAIT_OBJECT_0 - 1;
    HidDevice* dev = open[idx];
    DWORD bytes = 0;
    if (!GetOverlappedResult(dev->handle, &dev->ov, &bytes, FALSE)) {
      // Device desconectado o error: cerrarlo; el rescan lo reabrirá si vuelve.
      openPaths.erase(dev->path);
      closeDevice(dev);
      open.erase(open.begin() + idx);
      continue;
    }
    const bool nowCreate = createPressed(dev->buf.data(), bytes);
    if (nowCreate && !dev->prevCreate) emitCapture();  // flanco de pulsación
    dev->prevCreate = nowCreate;

    if (!startRead(*dev)) {
      openPaths.erase(dev->path);
      closeDevice(dev);
      open.erase(open.begin() + idx);
    }
  }

  for (auto* dev : open) closeDevice(dev);
}

// ------------------------------------------------------------------------------------------------
// Vía GameInput — Xbox (botón Compartir / system button Share)
// ------------------------------------------------------------------------------------------------

typedef HRESULT(STDAPICALLTYPE* PFN_GameInputInitialize)(REFIID riid, void** ppv);

IGameInput* g_gameInput = nullptr;
GameInputCallbackToken g_shareToken = 0;

void CALLBACK onSystemButton(GameInputCallbackToken /*token*/, void* /*context*/,
                             IGameInputDevice* /*device*/, uint64_t /*timestamp*/,
                             GameInputSystemButtons current, GameInputSystemButtons previous) {
  const bool now = (current & GameInputSystemButtonShare) != 0;
  const bool before = (previous & GameInputSystemButtonShare) != 0;
  if (now && !before) emitCapture();  // flanco de pulsación del botón Compartir
}

// Inicializa GameInput (best-effort). false si el runtime no está: la vía HID sigue funcionando.
bool startGameInput() {
  HMODULE dll = LoadLibraryW(L"GameInputRedist.dll");
  if (!dll) return false;
  auto init = reinterpret_cast<PFN_GameInputInitialize>(GetProcAddress(dll, "GameInputInitialize"));
  if (!init) return false;
  if (FAILED(init(IID_IGameInput, reinterpret_cast<void**>(&g_gameInput))) || !g_gameInput) {
    return false;
  }
  // Imprescindible: sin input en segundo plano, el botón solo llega con la app en primer plano.
  g_gameInput->SetFocusPolicy(GameInputEnableBackgroundInput | GameInputEnableBackgroundShareButton);
  return SUCCEEDED(g_gameInput->RegisterSystemButtonCallback(
      nullptr, GameInputSystemButtonShare, nullptr, onSystemButton, &g_shareToken));
}

void stopGameInput() {
  if (g_gameInput) {
    if (g_shareToken) g_gameInput->UnregisterCallback(g_shareToken);
    g_gameInput->Release();
    g_gameInput = nullptr;
  }
}

// ------------------------------------------------------------------------------------------------
// stdin → parada: bloquea leyendo stdin; al llegar EOF (padre cerró el pipe o murió) señala stop.
// ------------------------------------------------------------------------------------------------

void watchStdin() {
  HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  if (in && in != INVALID_HANDLE_VALUE) {
    char buf[128];
    DWORD n = 0;
    while (ReadFile(in, buf, sizeof(buf), &n, nullptr) && n > 0) {
      // Descartar la entrada; solo interesa el EOF.
    }
  }
  SetEvent(g_stopEvent);
}

}  // namespace

int main() {
  g_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);  // manual-reset

  const bool gameInputOk = startGameInput();  // Xbox (best-effort)
  std::thread stdinThread(watchStdin);

  runHidLoop();  // DualSense; bloquea hasta stopEvent

  stopGameInput();
  stdinThread.join();
  if (g_stopEvent) CloseHandle(g_stopEvent);
  (void)gameInputOk;
  return 0;
}
