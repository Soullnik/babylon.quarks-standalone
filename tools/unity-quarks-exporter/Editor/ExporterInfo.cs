namespace BabylonQuarks.UnityExporter
{
    /// <summary>What every exported file says about the exporter that wrote it.</summary>
    public static class ExporterInfo
    {
        /// <summary>
        /// The exporter's version: the babylon.quarks release it writes for. Kept equal to the
        /// package's <c>package.json</c> version; the exporter tests check it.
        /// </summary>
        public const string Version = "0.29.0";

        /// <summary>The <c>metadata.generator</c> of every exported file.</summary>
        public const string Generator = "babylon.quarks Unity exporter " + Version;

        /// <summary>
        /// The babylon.quarks JSON format the export is written in, as <c>metadata.quarksFormat</c>.
        /// A loader that reads an older format warns that settings it does not know are left out.
        /// </summary>
        public const int QuarksFormat = 2;
    }
}
