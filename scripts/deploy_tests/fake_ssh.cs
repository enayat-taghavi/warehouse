// Fake ssh / ssh-keygen used by the deploy.ps1 tests (compiled into scratch/, never shipped).
//  - "-F" (ssh-keygen -l -F host): prints a known_hosts line with FAKE_SSH_FP.
//  - FAKE_SSH_DOCKER=<container>: the remote command runs as "docker exec -i -u deploy <container> bash -c <cmd>"
//    with stdin/stdout/stderr inherited, so binary transfers and exit codes pass through unchanged.
//  - otherwise: prints two lines and exits with FAKE_SSH_EXIT (exit-code and output-leak test).
using System;
using System.Diagnostics;
using System.IO;
class FakeSsh {
    static int Main(string[] args) {
        if (Array.IndexOf(args, "-F") >= 0) {
            string fp = Environment.GetEnvironmentVariable("FAKE_SSH_FP") ?? "";
            Console.WriteLine("# Host example.test found: line 1");
            Console.WriteLine("example.test ED25519 " + fp);
            return 0;
        }
        string cmd = args.Length > 0 ? args[args.Length - 1] : "";
        string container = Environment.GetEnvironmentVariable("FAKE_SSH_DOCKER");
        if (!string.IsNullOrEmpty(container)) {
            string docker = Environment.GetEnvironmentVariable("FAKE_SSH_DOCKER_EXE") ?? "docker.exe";
            var parts = new System.Collections.Generic.List<string>();
            foreach (string a in new[] { "exec", "-i", "-u", "deploy", "-w", "/home/deploy", container, "bash", "-c", cmd }) parts.Add(Quote(a));
            var psi = new ProcessStartInfo(docker, string.Join(" ", parts));
            psi.UseShellExecute = false;
            using (var p = Process.Start(psi)) {
                p.WaitForExit();
                return p.ExitCode;
            }
        }
        if (cmd == "echo [SSH_CONNECTED_OK]") { Console.WriteLine("[SSH_CONNECTED_OK]"); return 0; }
        Console.OpenStandardInput().CopyTo(Stream.Null);
        Console.WriteLine("fake remote output line 1");
        Console.WriteLine("fake remote output line 2");
        string code = Environment.GetEnvironmentVariable("FAKE_SSH_EXIT") ?? "0";
        return int.Parse(code);
    }

    // Windows command-line quoting (CommandLineToArgvW rules; .NET Framework has no ArgumentList).
    static string Quote(string s) {
        if (s.Length > 0 && s.IndexOfAny(new[] { ' ', '\t', '\n', '"' }) < 0) return s;
        var sb = new System.Text.StringBuilder("\"");
        int slashes = 0;
        foreach (char c in s) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { sb.Append('\\', slashes * 2 + 1); sb.Append('"'); }
            else { sb.Append('\\', slashes); sb.Append(c); }
            slashes = 0;
        }
        sb.Append('\\', slashes * 2);
        sb.Append('"');
        return sb.ToString();
    }
}
