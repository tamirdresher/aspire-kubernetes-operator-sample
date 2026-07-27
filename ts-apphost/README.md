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
- `aspire.config.json` — Aspire runtime configuration, including any hosting-integration packages the AppHost references (here, `Aspire.Hosting.Go`)
- `package.json` — Node metadata + scripts. The one dependency is `vscode-jsonrpc`, which the SDK uses to talk to the Aspire runtime; `typescript`, `eslint`, `tsx`, and `nodemon` are dev-only.
- `tsconfig.apphost.json` — TypeScript compiler options for the AppHost
- `eslint.config.mjs` — ESLint config for the AppHost

## Prerequisites

- Node.js 20.19+, 22.13+, or 24+ (matches `package.json` engines)
- Docker Desktop, kind, kubectl on `PATH`
- Go 1.26+ (matches the operator's `go.mod`)
- Aspire CLI 13.4.6

## Run

```powershell
npm install
$env:GOMAXPROCS = "2"
aspire run
```

`aspire run` is what `package.json`'s `aspire:start` script invokes. On start:

1. The AppHost validates that `docker`, `kind`, `kubectl`, and `go` are on `PATH` and fails fast if any are missing.
2. It runs `scripts/kind-cluster.mjs` as an Aspire executable resource. That script creates or reuses a Kind cluster named `dev-cluster`, waits for it to be ready, applies the CRD, and waits for the CRD to be Established.
3. It then runs the Go operator via `builder.addGoApp(...)`, threaded with `KUBECONFIG` pointing at the cluster kubeconfig. The operator waits for the cluster setup to complete first.

Once green, in another shell:

```powershell
kubectl --context kind-dev-cluster apply -f ..\examples\greeter-sample.yaml
kubectl --context kind-dev-cluster get configmap greeting-tamir -o yaml
kubectl --context kind-dev-cluster get greeter tamir -o yaml
```

The operator's reconciler creates a `greeting-{name}` ConfigMap for each Greeter, with `message: "Hello, {name}!"`. Delete a Greeter and its ConfigMap is garbage-collected via the owner reference set by the reconciler.

## The AppHost, in full

`apphost.mts` is ~60 lines of TypeScript. It imports `createBuilder` from the local SDK, wires the cluster and operator resources with `.addExecutable` / `.addGoApp` / `.withEnvironment` / `.waitForCompletion`, and calls `builder.build().run()`. The API mirrors the C# `IDistributedApplicationBuilder` closely: same names, same shape, same mental model.

## Cleanup

```powershell
kind delete cluster --name dev-cluster
```
