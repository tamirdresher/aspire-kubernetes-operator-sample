# Aspire Kubernetes Operator Sample

A clone-and-play companion repo for the Aspire + Kubernetes operator blog post on [tamirdresher.com](https://tamirdresher.com).

This sample is intentionally small: a Go Kubernetes operator watches a `Greeter` custom resource and writes a matching `ConfigMap`. The same operator can be started from either a C# Aspire AppHost or a TypeScript Aspire AppHost.

## What is included

- `apphost/` — C# Aspire AppHost. It uses `CommunityToolkit.Aspire.Hosting.Kind` `13.4.1-beta.687` from NuGet, starts a persistent Kind cluster, applies the Greeter CRD, starts the Go operator, and adds dashboard commands.
- `kind-extensions/` — temporary C# extension that adds `WithManifest` for raw Kubernetes manifests to the C# AppHost. The published Kind package does not include manifest support yet; the upstream API is tracked in CommunityToolkit/Aspire PR #1481 as `AddManifest` / `AddManifestFromContent`. Delete this directory once that ships and is exposed by the package.
- `operator/` — the Go operator built with `controller-runtime`.
- `ts-apphost/` — TypeScript Aspire AppHost. It models the same Kind cluster + Go operator flow.
- `config/` — Kubernetes manifests, including the Greeter CRD.
- `examples/` — sample `Greeter` resources to apply.

## Prerequisites

Install these before pressing F5:

- .NET 10 SDK
- Go 1.23 or newer
- Docker Desktop, running
- [`kind`](https://kind.sigs.k8s.io/)
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/)
- Delve (`dlv`):

  ```powershell
  go install github.com/go-delve/delve/cmd/dlv@latest
  ```

  `dlv` installs to `$(go env GOPATH)/bin`, which is often not on `PATH`. Add that directory before debugging.
  The C# AppHost prints a startup warning when `dlv` is missing; this is expected and only means Go breakpoints will not bind until Delve is installed and on `PATH`.

- VS Code extensions:
  - `microsoft-aspire.aspire-vscode`
  - `golang.go`

The repo includes `.vscode/extensions.json`, so VS Code should recommend both extensions when you open the folder.

## Quick start: C# AppHost + single-F5 debugging

```powershell
git clone https://github.com/tamirdresher/aspire-kubernetes-operator-sample.git
cd aspire-kubernetes-operator-sample
code .
```

In VS Code:

1. Install the recommended extensions if prompted. `.vscode/extensions.json` surfaces the prompt automatically.
2. Make sure Docker Desktop is running.
3. Open `operator/controllers/greeter_controller.go`.
4. Set a breakpoint inside `Reconcile()` in `operator/controllers/greeter_controller.go`, for example on the line that builds the ConfigMap message.
5. Press F5 and choose **Debug Aspire AppHost**.
6. When the dashboard opens, click **Apply Greeter (timestamped)** on the `dev-cluster` resource.
7. The breakpoint hits.

The dashboard also exposes **Delete all Greeters** on `dev-cluster` for cleanup after repeated runs.

## Running without VS Code

```powershell
dotnet restore
$env:GOMAXPROCS = "2"
aspire run --non-interactive
```

Then apply the sample manually if you do not use the dashboard command:

```powershell
kubectl --context kind-dev-cluster apply -f .\examples\greeter-sample.yaml
kubectl --context kind-dev-cluster get configmap greeting-tamir -o yaml
```

## TypeScript AppHost

The TypeScript AppHost lives in `ts-apphost/`:

```powershell
cd ts-apphost
npm install
npm run build
$env:GOMAXPROCS = "2"
aspire run
```

It uses the same Go operator and the same Greeter CRD. `ts-apphost/aspire.config.json` lists both `Aspire.Hosting.Go` and `CommunityToolkit.Aspire.Hosting.Kind` in its `packages` block; Aspire projects those C# hosting integrations into TypeScript and generates bindings under `ts-apphost/.aspire/modules/`.

`ts-apphost/apphost.mts` declares the persistent Kind cluster with `addKindCluster(...).withClusterLifetime(ClusterLifetime.Persistent)`, wires the CRD apply step with `withKindClusterReference(cluster)`, and starts the operator with `addGoApp(..., { packagePath: '.' })`. The `packagePath: '.'` value is intentional; see the gotcha below.

`scripts/apply-crd.mjs` exists only because the published Kind TypeScript binding does not yet generate a manifest API such as `withManifest`. The script is deliberately narrow: Aspire supplies `KUBECONFIG`, then the script applies `config/greeter-crd.yaml` and waits for `greeters.hello.tamirdresher.dev` to become Established. Once the upstream manifest API in CommunityToolkit/Aspire PR #1481 (`AddManifest` / `AddManifestFromContent`) ships and is projected into TypeScript, this executable helper can be deleted.

## The `packagePath` gotcha

`AddGoApp`'s third parameter is `packagePath`: a Go package directory relative to `appDirectory`, not an entry-file path.

For this sample, `operator/go.mod` and `operator/main.go` are both in `operator/`, so the C# AppHost calls:

```csharp
builder.AddGoApp("greeter-operator", operatorDir)
```

Do not pass `"./main.go"`. `go run` tolerates a filename, so the process may appear to start, but the debugger passes the same value to Delve. Delve expects a package directory. The symptom is `Invalid debug adapter`, the resource exits with code 2, and the logs print Go's usage banner.

## Why `kind-extensions/` exists

The published `CommunityToolkit.Aspire.Hosting.Kind` package does not yet include manifest support. This sample needs manifest support to apply the Greeter CRD during AppHost startup.

`kind-extensions/` is a small gap-filler with the same shape as the upstream manifest work. The upstream API is tracked in CommunityToolkit/Aspire PR #1481 as `AddManifest` / `AddManifestFromContent`. Once it ships in the published package, remove this directory, bump the package version, and call the package-provided manifest API instead.

## Cleanup

```powershell
kind delete cluster --name dev-cluster
```

## Learn more

See [ts-apphost/README.md](ts-apphost/README.md) for TypeScript-specific notes on Aspire's TS AppHost scaffold and the local `.aspire/modules/aspire.mjs` SDK.


