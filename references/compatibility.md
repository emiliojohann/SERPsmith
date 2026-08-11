# Compatibility

SERPsmith provides multi-platform AI agent support. The same core workflow can run anywhere the agent environment provides the required repository, research, image, network, secret, state, and approval tools.

## Platform status

- **OpenClaw — production-tested reference integration.** Manual and unattended publishing run on real sites with filesystem/Git, web research, images, bounded HTTP, checkpoints/locks, scheduling, messaging, Google, Bing, IndexNow, and the guarded execution plugin.
- **Hermes — designed to work; certification pending.** Treat as experimental until the exact Hermes version completes the capability map, fixture, interruption/resume, failure injection, search adapters, scheduling, action-boundary, and final-delivery tests.
- **Claude-based agent environments — designed to work; certification pending.** This includes coding or agent setups that can load the complete skill and provide every required tool. A normal chat without repository and execution tools is not enough.
- **ChatGPT agent environments — designed to work; certification pending.** The environment must load the complete skill and provide every required tool. A normal chat without repository and execution tools is not enough.
- **Other AI agent platforms — designed to work; certification pending.** Certify the exact runtime, version, host, tools, and permissions independently.

“Production-tested” means the documented integration has completed real publishing and safety validation. It is not a promise that bugs are impossible. “Certification pending” means SERPsmith is intended to work there, but that exact environment has not completed the full test matrix yet.
