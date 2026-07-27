using Aspire.Hosting;
using Aspire.Hosting.Go;
using System.Diagnostics;

GreeterPrerequisites.ValidateOrThrow();

var builder = DistributedApplication.CreateBuilder(args);
var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
var operatorDir = Path.Combine(repoRoot, "operator");

var cluster = builder
    .AddKindCluster("dev-cluster")
    .WithClusterLifetime(ClusterLifetime.Persistent)
    .WithManifest(Path.Combine(repoRoot, "config", "greeter-crd.yaml"))
    .WithApplyGreeterCommand()
    .WithDeleteGreetersCommand();

builder
    .AddGoApp("greeter-operator", operatorDir)
    .WithEnvironment("KUBECONFIG", cluster.Resource.KubeconfigPath)
    .WithEnvironment("GOFLAGS", "-mod=mod")
    .WaitFor(cluster);

builder.Build().Run();

internal static class GreeterPrerequisites
{
    public static void ValidateOrThrow()
    {
        var missing = new List<string>();
        var checks = new (string Tool, string[] Arguments)[]
        {
            ("docker", ["--version"]),
            ("kind", ["--version"]),
            ("kubectl", ["version", "--client"]),
            ("go", ["version"]),
        };

        foreach (var (tool, arguments) in checks)
        {
            if (!CanRun(tool, arguments))
            {
                missing.Add(tool);
            }
        }

        if (missing.Count > 0)
        {
            throw new InvalidOperationException(
                "Missing prerequisite(s): " + string.Join(", ", missing) +
                ". Install Docker Desktop, kind, kubectl, and Go, then retry `aspire start`.");
        }
    }

    private static bool CanRun(string fileName, IReadOnlyList<string> arguments)
    {
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                },
            };

            foreach (var argument in arguments)
            {
                process.StartInfo.ArgumentList.Add(argument);
            }

            process.Start();
            return process.WaitForExit(10_000) && process.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }
}
