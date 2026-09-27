using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace BabylonQuarks.ParityCapture
{
    /// <summary>
    /// Collects every console message raised while the capture runs — Unity's own, the exporter's
    /// and ours — plus the outcome of each step, so a capture that went wrong on someone else's
    /// machine can be diagnosed from the archive alone.
    /// </summary>
    internal sealed class ParityLog : IDisposable
    {
        private readonly StringBuilder _all = new StringBuilder();
        private readonly List<string> _scope = new List<string>();
        private readonly DateTime _start = DateTime.Now;
        private StringBuilder _capture;

        public int Errors { get; private set; }
        public int Warnings { get; private set; }

        public ParityLog()
        {
            Application.logMessageReceived += OnMessage;
        }

        public void Dispose()
        {
            Application.logMessageReceived -= OnMessage;
        }

        private void OnMessage(string message, string stackTrace, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert) Errors++;
            if (type == LogType.Warning) Warnings++;
            string line = Stamp() + " [" + type + "] " + Scope() + message;
            _all.AppendLine(line);
            if ((type == LogType.Exception || type == LogType.Error) && !string.IsNullOrEmpty(stackTrace))
            {
                _all.AppendLine(Indent(stackTrace));
            }
            _capture?.AppendLine("[" + type + "] " + message);
        }

        /// <summary>Records a line without sending it to the Unity console.</summary>
        public void Note(string message)
        {
            _all.AppendLine(Stamp() + " [Note] " + Scope() + message);
        }

        /// <summary>
        /// Runs one step, records how it ended and how long it took, and never lets its failure
        /// stop the rest of the capture.
        /// </summary>
        public bool Step(string name, JMap status, Action body)
        {
            _scope.Add(name);
            var started = DateTime.Now;
            bool ok = true;
            try
            {
                body();
            }
            catch (Exception e) when (!(e is OperationCanceledException))
            {
                ok = false;
                Errors++;
                _all.AppendLine(Stamp() + " [StepFailed] " + Scope() + e.GetType().Name + ": " + e.Message);
                _all.AppendLine(Indent(e.StackTrace ?? ""));
                status?.Set(name + ".error", e.GetType().Name + ": " + e.Message);
            }
            finally
            {
                double ms = (DateTime.Now - started).TotalMilliseconds;
                status?.Set(name + ".ok", ok);
                status?.Set(name + ".ms", Math.Round(ms));
                _scope.RemoveAt(_scope.Count - 1);
            }
            return ok;
        }

        /// <summary>Starts copying console messages into a separate buffer (e.g. the exporter's warnings).</summary>
        public void BeginCapture() => _capture = new StringBuilder();

        public string EndCapture()
        {
            string text = _capture?.ToString() ?? "";
            _capture = null;
            return text;
        }

        public void WriteTo(string path) => File.WriteAllText(path, _all.ToString(), new UTF8Encoding(false));

        private string Scope() => _scope.Count == 0 ? "" : "(" + string.Join(" > ", _scope) + ") ";

        private string Stamp() =>
            (DateTime.Now - _start).TotalSeconds.ToString("0000.000", CultureInfo.InvariantCulture);

        private static string Indent(string text) => "    " + text.Replace("\n", "\n    ").TrimEnd();
    }
}
