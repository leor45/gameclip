// gc-app-audio-mute — silencia (o reactiva) la sesión de audio de un proceso en los dispositivos
// de salida cuyo nombre contenga un patrón.
//
// Caso de uso: mutear obs64.exe en el "DualSense Wireless Controller" para que la vibración háptica
// —que el mando transporta como una señal de audio— no se cuele en la grabación de GameClip. Ver
// spec/work/feature-silenciar-haptico-dualsense.
//
// Uso:
//   gc-app-audio-mute.exe --device "DualSense" --process "obs64.exe" [--mute|--unmute]
//
// Códigos de salida:
//   0  aplicado a al menos una sesión
//   2  ningún dispositivo de render coincide con el patrón
//   3  hay dispositivo(s) pero ninguna sesión del proceso indicado
//   1  error de inicialización/COM o argumentos faltantes
//
// No escribe nada en disco: enumera, aplica SetMute y sale. Efímero por diseño (ver el invariante
// de temp-cleanup en el plan).

#define INITGUID
#include <windows.h>
#include <initguid.h>
#include <mmdeviceapi.h>
#include <Functiondiscoverykeys_devpkey.h>
#include <audiopolicy.h>

#include <string>
#include <cwctype>
#include <cstdio>

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

// Silencia (o reactiva) las sesiones del proceso `target` en un dispositivo ya activado.
// Devuelve cuántas sesiones se tocaron.
int muteSessionsOnDevice(IMMDevice* device, const std::wstring& target, BOOL mute) {
  IAudioSessionManager2* manager = nullptr;
  if (FAILED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
                              reinterpret_cast<void**>(&manager)))) {
    return 0;
  }

  IAudioSessionEnumerator* sessions = nullptr;
  if (FAILED(manager->GetSessionEnumerator(&sessions))) {
    safeRelease(manager);
    return 0;
  }

  int count = 0;
  int touched = 0;
  sessions->GetCount(&count);
  for (int i = 0; i < count; ++i) {
    IAudioSessionControl* control = nullptr;
    if (FAILED(sessions->GetSession(i, &control)) || !control) continue;

    IAudioSessionControl2* control2 = nullptr;
    DWORD pid = 0;
    if (SUCCEEDED(control->QueryInterface(__uuidof(IAudioSessionControl2),
                                          reinterpret_cast<void**>(&control2)))) {
      control2->GetProcessId(&pid);
    }

    if (pid != 0 && _wcsicmp(processName(pid).c_str(), target.c_str()) == 0) {
      ISimpleAudioVolume* volume = nullptr;
      if (SUCCEEDED(control->QueryInterface(__uuidof(ISimpleAudioVolume),
                                            reinterpret_cast<void**>(&volume)))) {
        if (SUCCEEDED(volume->SetMute(mute, nullptr))) ++touched;
        safeRelease(volume);
      }
    }

    safeRelease(control2);
    safeRelease(control);
  }

  safeRelease(sessions);
  safeRelease(manager);
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

}  // namespace

int wmain(int argc, wchar_t** argv) {
  const wchar_t* devicePattern = argValue(argc, argv, L"--device");
  const wchar_t* process = argValue(argc, argv, L"--process");
  if (!devicePattern || !process || !*devicePattern || !*process) {
    fwprintf(stderr, L"uso: gc-app-audio-mute --device <patron> --process <exe> [--mute|--unmute]\n");
    return 1;
  }
  const BOOL mute = hasFlag(argc, argv, L"--unmute") ? FALSE : TRUE;

  if (FAILED(CoInitializeEx(nullptr, COINIT_MULTITHREADED))) return 1;

  int result = 1;
  IMMDeviceEnumerator* enumerator = nullptr;
  IMMDeviceCollection* devices = nullptr;

  if (SUCCEEDED(CoCreateInstance(CLSID_MMDeviceEnumerator, nullptr, CLSCTX_ALL,
                                 IID_IMMDeviceEnumerator,
                                 reinterpret_cast<void**>(&enumerator))) &&
      SUCCEEDED(enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices))) {
    UINT count = 0;
    devices->GetCount(&count);
    bool anyDevice = false;
    int totalTouched = 0;
    const std::wstring pattern = devicePattern;
    const std::wstring target = process;

    for (UINT i = 0; i < count; ++i) {
      IMMDevice* device = nullptr;
      if (FAILED(devices->Item(i, &device)) || !device) continue;
      if (contains(friendlyName(device), pattern)) {
        anyDevice = true;
        totalTouched += muteSessionsOnDevice(device, target, mute);
      }
      safeRelease(device);
    }

    result = !anyDevice ? 2 : (totalTouched == 0 ? 3 : 0);
  }

  safeRelease(devices);
  safeRelease(enumerator);
  CoUninitialize();
  return result;
}
