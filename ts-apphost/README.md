# Greeter Operator — TypeScript AppHost

The Aspire TypeScript AppHost that orchestrates the same Greeter operator as the sibling C# AppHost.

## What Aspire scaffolded

This folder was created with:

```powershell
aspire init --language typescript
```

Aspire generated:

- `apphost.mts` — the AppHost itself (TypeScript ESM module)
- `.aspire/modules/` — the **generated local SDK** the AppHost imports (`aspire.mts` / `aspire.mjs`). This is Aspire's polyglot SDK bridge; there is no separate `@microsoft/aspire-hosting` npm package to install.
- `aspire.config.json` — Aspire runtime configuration, including any hosting-integration packages the AppHost references (here, `Aspire.Hosting.Go` and `CommunityToolkit.Aspire.Hosting.Kind`)
- `package.json` — Node metadata + scripts. The one dependency is `vscode-jsonrpc`, which the SDK uses to talk to the Aspire runtime; `typescript`, `eslint`, `tsx`, and `nodemon` are dev-only.
- `tsconfig.apphost.json` — TypeScript compiler options for the AppHost
- `eslint.config.mjs` — ESLint config for the AppHost

## Prerequisites

- Node.js 20.19+, 22.13+, or 24+ (matches `package.json` engines)
- Docker Desktop, kind, kubectl on `PATH`
- Go 1.23+ (matches the operator's `go.mod`)
- Aspire CLI 13.4.6

## Run

```powershell
npm install
$env:GOMAXPROCS = "2"
aspire run
```

`aspire run` is what `package.json`'s `aspire:start` script invokes. On start:

1. The AppHost validates that `docker`, `kind`, `kubectl`, and `go` are on `PATH` and fails fast if any are missing.
2. It declares a persistent Kind cluster named `dev-cluster` with `builder.addKindCluster(...)` from `CommunityToolkit.Aspire.Hosting.Kind`. Aspire creates or reuses that cluster.
3. It runs `scripts/apply-crd.mjs` as a small Aspire executable resource. The executable is wired with `withKindClusterReference(cluster)`, so Aspire supplies `KUBECONFIG`; the script only applies `config/greeter-crd.yaml` and waits for the CRD to be Established.
4. It then runs the Go operator via `builder.addGoApp(...)`, also wired with `withKindClusterReference(cluster)`. The operator waits for both the cluster and CRD resource before starting.

Once green, in another shell:

```powershell
kubectl --context kind-dev-cluster apply -f ..\examples\greeter-sample.yaml
kubectl --context kind-dev-cluster get configmap greeting-tamir -o yaml
kubectl --context kind-dev-cluster get greeter tamir -o yaml
```

The operator's reconciler creates a `greeting-{name}` ConfigMap for each Greeter, with `message: "Hello, {name}!"`. Delete a Greeter and its ConfigMap is garbage-collected via the owner reference set by the reconciler.

## The AppHost, in full

`apphost.mts` is ~50 lines of TypeScript. It imports `createBuilder` and `ClusterLifetime` from the local SDK, wires the cluster with `.addKindCluster(...).withClusterLifetime(ClusterLifetime.Persistent)`, wires the CRD apply step as a narrow executable workaround, wires the operator with `.addGoApp(..., { packagePath: '.' }).withKindClusterReference(cluster)`, and calls `builder.build().run()`. The API mirrors the C# `IDistributedApplicationBuilder` closely; the remaining mismatch is raw manifest application for Kind clusters, because the published TypeScript binding does not yet expose the local C# sample's `WithManifest` extension.

## Cleanup

```powershell
kind delete cluster --name dev-cluster
```
