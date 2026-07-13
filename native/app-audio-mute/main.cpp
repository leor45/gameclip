// gc-app-audio-mute — silencia la sesión de audio de un proceso en los dispositivos de salida cuyo
// nombre contenga un patrón. Caso de uso: mutear obs64.exe en el "DualSense Wireless Controller"
// para que la vibración háptica —que el mando transporta como señal de audio— no se cuele en la
// grabación de GameClip. Ver spec/work/fix-haptico-dualsense-event-driven.
//
// Dos modos:
//
//   --mute / --unmute (un disparo): enumera, aplica SetMute y sale. Códigos de salida:
//       0 aplicado a ≥1 sesión · 2 sin dispositivo · 3 sin sesión del proceso · 1 error/args.
//
//   --watch (persistente, event-driven): registra notificaciones de Core Audio y mutea la sesión
//       de obs64.exe EN CUANTO aparece (OnSessionCreated) —clave porque en el DualSense la sesión
//       no se crea hasta que el mando emite audio (al pulsar un botón)—; re-escanea al conectarse
//       un mando nuevo. Bloquea hasta EOF de stdin (el padre cerró el pipe o murió) y sale. No hay
//       polling: en reposo duerme. Siempre devuelve 0.
//
// Uso:
//   gc-app-audio-mute.exe --device "DualSense" --process "obs64.exe" [--mute|--unmute|--watch]

#define INITGUID
#include <windows.h>
#include <initguid.h>
#include <mmdeviceapi.h>
#include <Functiondiscoverykeys_devpkey.h>
#include <audiopolicy.h>

#include <cstdio>
#include <cwctype>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <utility>

namespace {

std::wstring toLower(std::wstring s) {
  for (auto& c : s) c = static_cast<wchar_t>(std::towlower(c));
  return s;
}

bool contains(const std::wstring& haystack, const std::wstring& needle) {
  if (needle.empty()) return false;
  return toLower(haystack).find(toLower(needle)) != std::wstring::npos;
}

std::wstring baseName(const std::wstring& path) {
  const size_t p = path.find_last_of(L"\\/");
  return p == std::wstring::npos ? path : path.substr(p + 1);
}

// Nombre del ejecutable (basename) de un PID, o cadena vacía si no se puede abrir el proceso.
std::wstring processName(DWORD pid) {
  if (pid == 0) return L"";
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!h) return L"";
  wchar_t buf[MAX_PATH];
  DWORD size = MAX_PATH;
  std::wstring name;
  if (QueryFullProcessImageNameW(h, 0, buf, &size)) {
    name = baseName(std::wstring(buf, size));
  }
  CloseHandle(h);
  return name;
}

template <typename T>
void safeRelease(T*& p) {
  if (p) {
    p->Release();
    p = nullptr;
  }
}

// Si la sesión pertenece a `target`, le aplica SetMute. Devuelve true si la tocó.
bool muteIfMatches(IAudioSessionControl* control, const std::wstring& target, BOOL mute) {
  if (!control) return false;
  IAudioSessionControl2* control2 = nullptr;
  DWORD pid = 0;
  if (SUCCEEDED(control->QueryInterface(__uuidof(IAudioSessionControl2),
                                        reinterpret_cast<void**>(&control2)))) {
    control2->GetProcessId(&pid);
  }
  bool touched = false;
  if (pid != 0 && _wcsicmp(processName(pid).c_str(), target.c_str()) == 0) {
    ISimpleAudioVolume* volume = nullptr;
    if (SUCCEEDED(control->QueryInterface(__uuidof(ISimpleAudioVolume),
                                          reinterpret_cast<void**>(&volume)))) {
      if (SUCCEEDED(volume->SetMute(mute, nullptr))) touched = true;
      safeRelease(volume);
    }
  }
  safeRelease(control2);
  return touched;
}

// Recorre las sesiones ya existentes del manager y mutea las de `target`. Devuelve cuántas tocó.
int muteExistingSessions(IAudioSessionManager2* manager, const std::wstring& target, BOOL mute) {
  IAudioSessionEnumerator* sessions = nullptr;
  if (FAILED(manager->GetSessionEnumerator(&sessions))) return 0;
  int count = 0;
  int touched = 0;
  sessions->GetCount(&count);
  for (int i = 0; i < count; ++i) {
    IAudioSessionControl* control = nullptr;
    if (FAILED(sessions->GetSession(i, &control)) || !control) continue;
    if (muteIfMatches(control, target, mute)) ++touched;
    safeRelease(control);
  }
  safeRelease(sessions);
  return touched;
}

// friendly name del dispositivo (PKEY_Device_FriendlyName), o cadena vacía.
std::wstring friendlyName(IMMDevice* device) {
  IPropertyStore* store = nullptr;
  if (FAILED(device->OpenPropertyStore(STGM_READ, &store))) return L"";
  PROPVARIANT value;
  PropVariantInit(&value);
  std::wstring name;
  if (SUCCEEDED(store->GetValue(PKEY_Device_FriendlyName, &value)) && value.vt == VT_LPWSTR &&
      value.pwszVal) {
    name = value.pwszVal;
  }
  PropVariantClear(&value);
  safeRelease(store);
  return name;
}

std::wstring deviceId(IMMDevice* device) {
  LPWSTR id = nullptr;
  std::wstring out;
  if (SUCCEEDED(device->GetId(&id)) && id) {
    out = id;
    CoTaskMemFree(id);
  }
  return out;
}

const wchar_t* argValue(int argc, wchar_t** argv, const wchar_t* flag) {
  for (int i = 1; i + 1 < argc; ++i) {
    if (_wcsicmp(argv[i], flag) == 0) return argv[i + 1];
  }
  return nullptr;
}

bool hasFlag(int argc, wchar_t** argv, const wchar_t* flag) {
  for (int i = 1; i < argc; ++i) {
    if (_wcsicmp(argv[i], flag) == 0) return true;
  }
  return false;
}

// ----------------------------------------------------------------------------------------------
// Modo un disparo
// ----------------------------------------------------------------------------------------------

int runOnce(const std::wstring& pattern, const std::wstring& target, BOOL mute) {
  IMMDeviceEnumerator* enumerator = nullptr;
  IMMDeviceCollection* devices = nullptr;
  int result = 1;

  if (SUCCEEDED(CoCreateInstance(CLSID_MMDeviceEnumerator, nullptr, CLSCTX_ALL,
                                 IID_IMMDeviceEnumerator,
                                 reinterpret_cast<void**>(&enumerator))) &&
      SUCCEEDED(enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices))) {
    UINT count = 0;
    devices->GetCount(&count);
    bool anyDevice = false;
    int totalTouched = 0;
    for (UINT i = 0; i < count; ++i) {
      IMMDevice* device = nullptr;
      if (FAILED(devices->Item(i, &device)) || !device) continue;
      if (contains(friendlyName(device), pattern)) {
        anyDevice = true;
        IAudioSessionManager2* manager = nullptr;
        if (SUCCEEDED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
                                       reinterpret_cast<void**>(&manager)))) {
          totalTouched += muteExistingSessions(manager, target, mute);
          safeRelease(manager);
        }
      }
      safeRelease(device);
    }
    result = !anyDevice ? 2 : (totalTouched == 0 ? 3 : 0);
  }

  safeRelease(devices);
  safeRelease(enumerator);
  return result;
}

// ----------------------------------------------------------------------------------------------
// Modo watch (event-driven)
// ----------------------------------------------------------------------------------------------

// Notifica la creación de sesiones nuevas: mutea la del proceso objetivo en cuanto aparece. Es un
// objeto de pila cuya vida cubre todas las registraciones (se desregistra antes de destruirse), así
// que AddRef/Release no borran (constantes): nunca hay que hacer `delete this`.
class SessionNotif : public IAudioSessionNotification {
 public:
  explicit SessionNotif(std::wstring target) : target_(std::move(target)) {}
  ULONG STDMETHODCALLTYPE AddRef() override { return 2; }
  ULONG STDMETHODCALLTYPE Release() override { return 1; }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IAudioSessionNotification)) {
      *ppv = static_cast<IAudioSessionNotification*>(this);
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  HRESULT STDMETHODCALLTYPE OnSessionCreated(IAudioSessionControl* newSession) override {
    muteIfMatches(newSession, target_, TRUE);
    return S_OK;
  }

 private:
  std::wstring target_;
};

struct WatchContext {
  IMMDeviceEnumerator* enumerator = nullptr;
  std::wstring pattern;
  std::wstring target;
  SessionNotif* sessionNotif = nullptr;
  std::mutex mtx;
  // deviceId → manager con la notificación de sesiones registrada (se mantiene vivo para recibirlas).
  std::map<std::wstring, IAudioSessionManager2*> watched;
};

// (Re)escanea los endpoints de render activos: registra la vigilancia de sesiones en los que
// matcheen el patrón y aún no estén vigilados (muteando de paso lo ya existente), y suelta los que
// dejaron de estar activos. Idempotente. Con lock: lo llaman el arranque y los callbacks de device.
void rescan(WatchContext& ctx) {
  std::lock_guard<std::mutex> lock(ctx.mtx);

  IMMDeviceCollection* devices = nullptr;
  if (FAILED(ctx.enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices))) return;

  std::set<std::wstring> current;
  UINT count = 0;
  devices->GetCount(&count);
  for (UINT i = 0; i < count; ++i) {
    IMMDevice* device = nullptr;
    if (FAILED(devices->Item(i, &device)) || !device) continue;
    if (contains(friendlyName(device), ctx.pattern)) {
      const std::wstring id = deviceId(device);
      current.insert(id);
      if (!id.empty() && ctx.watched.find(id) == ctx.watched.end()) {
        IAudioSessionManager2* manager = nullptr;
        if (SUCCEEDED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
                                       reinterpret_cast<void**>(&manager)))) {
          manager->RegisterSessionNotification(ctx.sessionNotif);
          // Quirk documentado: sin un GetSessionEnumerator tras registrar, OnSessionCreated no
          // dispara. De paso, mutea las sesiones del proceso que ya existieran.
          muteExistingSessions(manager, ctx.target, TRUE);
          ctx.watched.emplace(id, manager);
        }
      }
    }
    safeRelease(device);
  }
  safeRelease(devices);

  // Soltar los dispositivos que ya no están activos/presentes.
  for (auto it = ctx.watched.begin(); it != ctx.watched.end();) {
    if (current.find(it->first) == current.end()) {
      it->second->UnregisterSessionNotification(ctx.sessionNotif);
      it->second->Release();
      it = ctx.watched.erase(it);
    } else {
      ++it;
    }
  }
}

// Notifica altas/bajas/cambios de estado de dispositivos → re-escaneo idempotente. Mismo patrón de
// vida que SessionNotif (objeto de pila, AddRef/Release constantes).
class DeviceNotif : public IMMNotificationClient {
 public:
  explicit DeviceNotif(WatchContext* ctx) : ctx_(ctx) {}
  ULONG STDMETHODCALLTYPE AddRef() override { return 2; }
  ULONG STDMETHODCALLTYPE Release() override { return 1; }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IMMNotificationClient)) {
      *ppv = static_cast<IMMNotificationClient*>(this);
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  HRESULT STDMETHODCALLTYPE OnDeviceStateChanged(LPCWSTR, DWORD) override {
    rescan(*ctx_);
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnDeviceAdded(LPCWSTR) override {
    rescan(*ctx_);
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnDeviceRemoved(LPCWSTR) override {
    rescan(*ctx_);
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnDefaultDeviceChanged(EDataFlow, ERole, LPCWSTR) override {
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE OnPropertyValueChanged(LPCWSTR, const PROPERTYKEY) override {
    return S_OK;
  }

 private:
  WatchContext* ctx_;
};

// Bloquea hasta que el padre cierra stdin (o muere): así el listener sale sin quedar huérfano.
void blockUntilStdinClosed() {
  HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  if (!in || in == INVALID_HANDLE_VALUE) {
    for (;;) Sleep(60000);
  }
  char buf[128];
  DWORD n = 0;
  while (ReadFile(in, buf, sizeof(buf), &n, nullptr) && n > 0) {
    // Descartar cualquier entrada; solo interesa el EOF.
  }
}

int runWatch(const std::wstring& pattern, const std::wstring& target) {
  WatchContext ctx;
  ctx.pattern = pattern;
  ctx.target = target;
  SessionNotif sessionNotif(target);
  ctx.sessionNotif = &sessionNotif;
  DeviceNotif deviceNotif(&ctx);

  if (FAILED(CoCreateInstance(CLSID_MMDeviceEnumerator, nullptr, CLSCTX_ALL,
                              IID_IMMDeviceEnumerator,
                              reinterpret_cast<void**>(&ctx.enumerator)))) {
    return 1;
  }

  ctx.enumerator->RegisterEndpointNotificationCallback(&deviceNotif);
  rescan(ctx);  // registra la vigilancia inicial y mutea lo ya existente

  blockUntilStdinClosed();

  // Teardown: desregistrar todo antes de que los objetos de pila se destruyan.
  ctx.enumerator->UnregisterEndpointNotificationCallback(&deviceNotif);
  {
    std::lock_guard<std::mutex> lock(ctx.mtx);
    for (auto& entry : ctx.watched) {
      entry.second->UnregisterSessionNotification(ctx.sessionNotif);
      entry.second->Release();
    }
    ctx.watched.clear();
  }
  safeRelease(ctx.enumerator);
  return 0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  const wchar_t* devicePattern = argValue(argc, argv, L"--device");
  const wchar_t* process = argValue(argc, argv, L"--process");
  if (!devicePattern || !process || !*devicePattern || !*process) {
    fwprintf(stderr,
             L"uso: gc-app-audio-mute --device <patron> --process <exe> [--mute|--unmute|--watch]\n");
    return 1;
  }
  const std::wstring pattern = devicePattern;
  const std::wstring target = process;
  const bool watch = hasFlag(argc, argv, L"--watch");
  const BOOL mute = hasFlag(argc, argv, L"--unmute") ? FALSE : TRUE;

  if (FAILED(CoInitializeEx(nullptr, COINIT_MULTITHREADED))) return 1;
  const int result = watch ? runWatch(pattern, target) : runOnce(pattern, target, mute);
  CoUninitialize();
  return result;
}
