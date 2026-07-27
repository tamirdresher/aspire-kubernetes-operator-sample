using System.Diagnostics;
using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting;

public static class ApplyGreeterCommand
{
    public static IResourceBuilder<KindClusterResource> WithApplyGreeterCommand(
        this IResourceBuilder<KindClusterResource> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.WithCommand(
            name: "apply-greeter",
            displayName: "Apply Greeter (timestamped)",
            executeCommand: async _ =>
            {
                var stamp = DateTimeOffset.Now.ToString("yyyyMMdd-HHmmss");
                var crName = $"greeter-{stamp}";
                var specName = $"tamir-{stamp}";

                var yaml = $"""
                    apiVersion: hello.tamirdresher.dev/v1alpha1
                    kind: Greeter
                    metadata:
                      name: {crName}
                      namespace: default
                    spec:
                      name: {specName}
                    """;

                var (exitCode, stdout, stderr) = await RunKubectlAsync(
                    ["--kubeconfig", builder.Resource.KubeconfigPath, "apply", "-f", "-"],
                    yaml);

                if (exitCode != 0)
                {
                    var failureText = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
                    return CommandResults.Failure(
                        $"kubectl apply failed for {crName}.",
                        failureText,
                        CommandResultFormat.Text);
                }

                var output = stdout.Trim();
                return CommandResults.Success(
                    $"Applied {crName} (spec.name={specName})",
                    output,
                    CommandResultFormat.Text,
                    true);
            },
            new CommandOptions
            {
                Description = "Applies a timestamped Greeter custom resource to trigger the operator reconcile loop.",
                IconName = "Add",
                UpdateState = _ => ResourceCommandState.Enabled,
            });

        return builder;
    }

    public static IResourceBuilder<KindClusterResource> WithDeleteGreetersCommand(
        this IResourceBuilder<KindClusterResource> builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.WithCommand(
            name: "delete-greeters",
            displayName: "Delete all Greeters",
            executeCommand: async _ =>
            {
                var (exitCode, stdout, stderr) = await RunKubectlAsync(
                    ["--kubeconfig", builder.Resource.KubeconfigPath, "delete", "greeters", "--all", "-n", "default", "--ignore-not-found"],
                    stdin: null);

                if (exitCode != 0)
                {
                    var failureText = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
                    return CommandResults.Failure(
                        "kubectl delete greeters --all failed.",
                        failureText,
                        CommandResultFormat.Text);
                }

                return CommandResults.Success(
                    "Deleted all Greeters.",
                    stdout.Trim(),
                    CommandResultFormat.Text,
                    true);
            },
            new CommandOptions
            {
                Description = "Deletes all Greeter custom resources from the default namespace.",
                IconName = "Delete",
                UpdateState = _ => ResourceCommandState.Enabled,
            });

        return builder;
    }

    private static async Task<(int ExitCode, string Stdout, string Stderr)> RunKubectlAsync(
        IReadOnlyList<string> arguments,
        string? stdin)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "kubectl",
                RedirectStandardInput = stdin is not null,
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

        if (stdin is not null)
        {
            await process.StandardInput.WriteAsync(stdin);
            await process.StandardInput.FlushAsync();
            process.StandardInput.Close();
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync();
        var stderrTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        return (process.ExitCode, await stdoutTask, await stderrTask);
    }
}
