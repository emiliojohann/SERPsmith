# SERPsmith runtime capability map

Complete this for the exact agent, version, model, host, plugin/tool set, and permission configuration. Do not reuse a certification after any of those change.

| Capability | Required mode | Tool or adapter | Permission boundary | Passing fixture | Safe failure fixture | Result |
|---|---|---|---|---|---|---|
| Skill/reference loading | Manual | [value] | Read-only skill directory | [evidence] | Missing reference stops | [status] |
| Bounded filesystem | Manual | [value] | Site repo + external state only | [evidence] | Out-of-scope path denied | [status] |
| Git read/fetch/push | Manual | [value] | One repo/branch, normal push | [evidence] | Dirty/diverged tree stops | [status] |
| Web research | Manual | [value] | HTTPS research sources | [evidence] | Timeout/rate limit classified | [status] |
| Image generation | Manual | [value] | New candidates only | [evidence] | Invalid candidate rejected | [status] |
| Image conversion/inspection | Manual | [value] | Approved asset paths | [evidence] | Wrong MIME/crop rejected | [status] |
| Bounded HTTP | Manual | [value] | Approved hosts, timeouts | [evidence] | Wrong host/status stops | [status] |
| Secret retrieval | Manual | [value] | Named secret only, never logged | [evidence] | Missing secret stops | [status] |
| Content adapter | Manual | [value] | Documented repo paths | [evidence] | Schema/path mismatch stops | [status] |
| Deployment verification | Manual | [value] | Read-only until approval | [evidence] | Failed deployment stops | [status] |
| Google Search Console | As configured | [value] | Exact property | [evidence] | Other property rejected | [status] |
| Bing Webmaster Tools | As configured | [value] | Exact verified site | [evidence] | Other site rejected | [status] |
| IndexNow | As configured | [value] | Exact host/key file | [evidence] | Wrong key/host rejected | [status] |
| Checkpoints and locks | Unattended | [value] | External/site-namespaced | [evidence] | Duplicate/interruption test | [status] |
| Scheduler | Unattended | [value] | Approved site/slot only | [evidence] | Unauthorized slot denied | [status] |
| Tool/action restriction | Unattended | [value] | No raw bypass path | [evidence] | Forbidden tool unavailable | [status] |
| Final reporting | Unattended | [value] | Approved destination reference | [evidence] | Delivery failure preserved | [status] |

Certification owner: [name/role]

Certification date: [date]

Overall result: [manual-ready / unattended-ready / experimental / unsupported]

Notes and limitations: [value]
