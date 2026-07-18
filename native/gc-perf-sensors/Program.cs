using System;
using System.Globalization;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;

// gc-perf-sensors: sensores de GPU (uso, temperatura, fans, voltaje, VRAM) y temperatura de CPU
// para el overlay de rendimiento de GameClip. Emite UNA linea JSON por segundo por stdout; los
// campos sin sensor disponible van en null y GameClip los pinta como "-".
//
// .NET Framework 4.8 (incluido en Windows 10/11): no necesita runtime aparte y el compilador de
// C# 5 que trae Windows (csc.exe) alcanza — por eso el codigo evita sintaxis moderna.
//
// La temperatura de CPU se lee de los MSR del procesador, que exigen anillo 0. Eso lo aporta PawnIO
// (el driver que LibreHardwareMonitor 0.9.6 usa en lugar del viejo WinRing0, marcado por Defender),
// que se instala aparte, y ademas hace falta ejecutar elevado. Si falta cualquiera de las dos cosas
// cpuTemp queda en null y GameClip lo pinta como "-"; los sensores de GPU van por NVAPI/ADL, que son
// APIs de usuario, asi que siguen funcionando igual. De las nueve metricas del overlay, PawnIO
// condiciona una sola.

namespace GcPerfSensors
{
    internal static class Program
    {
        private static volatile bool _salir;

        private static int Main(string[] args)
        {
            // Si GameClip muere, su handle de stdin se cierra: salir para no quedar huerfano.
            Thread watcher = new Thread(WatchStdin);
            watcher.IsBackground = true;
            watcher.Start();

            Computer computer = new Computer();
            computer.IsGpuEnabled = true;
            computer.IsCpuEnabled = true;
            try
            {
                computer.Open();
            }
            catch (Exception)
            {
                return 1;
            }

            try
            {
                while (!_salir)
                {
                    string linea;
                    try
                    {
                        linea = Sample(computer);
                    }
                    catch (Exception)
                    {
                        linea = "{}"; // un tick fallido no tumba el helper
                    }
                    Console.WriteLine(linea);
                    Console.Out.Flush();
                    Thread.Sleep(1000);
                }
            }
            finally
            {
                try { computer.Close(); } catch (Exception) { }
            }
            return 0;
        }

        private static void WatchStdin()
        {
            try
            {
                while (Console.In.ReadLine() != null) { }
            }
            catch (Exception) { }
            _salir = true;
        }

        private static string Sample(Computer computer)
        {
            foreach (IHardware hardware in computer.Hardware)
            {
                hardware.Update();
                foreach (IHardware sub in hardware.SubHardware) sub.Update();
            }

            IHardware gpu = PickGpu(computer);
            IHardware cpu = PickByType(computer, HardwareType.Cpu);

            float? gpuUsage = null, gpuTemp = null, gpuFan = null, gpuVoltage = null;
            float? vramUsed = null, vramTotal = null, cpuTemp = null;

            if (gpu != null)
            {
                gpuUsage = FindSensor(gpu, SensorType.Load, "GPU Core");
                gpuTemp = FindSensor(gpu, SensorType.Temperature, "GPU Core");
                gpuFan = FindSensor(gpu, SensorType.Fan, null);
                gpuVoltage = FindSensor(gpu, SensorType.Voltage, "GPU Core");
                // NVIDIA y AMD reportan la VRAM como SmallData en MB.
                vramUsed = FindSensor(gpu, SensorType.SmallData, "GPU Memory Used");
                vramTotal = FindSensor(gpu, SensorType.SmallData, "GPU Memory Total");
                if (vramUsed == null) vramUsed = FindSensor(gpu, SensorType.SmallData, "D3D Dedicated Memory Used");
            }

            if (cpu != null)
            {
                // AMD expone Tctl/Tdie; Intel, CPU Package. "Core Average" es el fallback comun.
                cpuTemp = FindSensor(cpu, SensorType.Temperature, "Core (Tctl/Tdie)");
                if (cpuTemp == null) cpuTemp = FindSensor(cpu, SensorType.Temperature, "CPU Package");
                if (cpuTemp == null) cpuTemp = FindSensor(cpu, SensorType.Temperature, "Core Average");
                if (cpuTemp == null) cpuTemp = FindSensor(cpu, SensorType.Temperature, null);
            }

            // Sin admin el driver ring0 no carga y algunos sensores de temperatura existen pero
            // leen 0: un 0 C es fisicamente implausible, se reporta como no disponible.
            if (cpuTemp.HasValue && cpuTemp.Value <= 0) cpuTemp = null;
            if (gpuTemp.HasValue && gpuTemp.Value <= 0) gpuTemp = null;

            StringBuilder json = new StringBuilder();
            json.Append("{");
            AppendField(json, "gpuUsage", gpuUsage, false);
            AppendField(json, "gpuTemp", gpuTemp, false);
            AppendField(json, "gpuFan", gpuFan, false);
            AppendField(json, "gpuVoltage", gpuVoltage, false);
            AppendField(json, "vramUsedMb", vramUsed, false);
            AppendField(json, "vramTotalMb", vramTotal, false);
            AppendField(json, "cpuTemp", cpuTemp, true);
            json.Append("}");
            return json.ToString();
        }

        /// La GPU "de verdad": discreta antes que integrada (una laptop suele tener las dos).
        private static IHardware PickGpu(Computer computer)
        {
            IHardware nvidia = PickByType(computer, HardwareType.GpuNvidia);
            if (nvidia != null) return nvidia;
            IHardware amd = PickByType(computer, HardwareType.GpuAmd);
            if (amd != null) return amd;
            return PickByType(computer, HardwareType.GpuIntel);
        }

        private static IHardware PickByType(Computer computer, HardwareType type)
        {
            foreach (IHardware hardware in computer.Hardware)
            {
                if (hardware.HardwareType == type) return hardware;
            }
            return null;
        }

        /// Sensor por tipo y nombre exacto; con name null, el primero del tipo que tenga valor.
        private static float? FindSensor(IHardware hardware, SensorType type, string name)
        {
            ISensor primero = null;
            foreach (ISensor sensor in hardware.Sensors)
            {
                if (sensor.SensorType != type || !sensor.Value.HasValue) continue;
                if (name == null)
                {
                    if (primero == null) primero = sensor;
                }
                else if (sensor.Name == name)
                {
                    return sensor.Value;
                }
            }
            return primero != null ? primero.Value : null;
        }

        private static void AppendField(StringBuilder json, string name, float? value, bool last)
        {
            json.Append('"').Append(name).Append("\":");
            if (value.HasValue)
            {
                json.Append(Math.Round(value.Value, 3).ToString(CultureInfo.InvariantCulture));
            }
            else
            {
                json.Append("null");
            }
            if (!last) json.Append(',');
        }
    }
}
