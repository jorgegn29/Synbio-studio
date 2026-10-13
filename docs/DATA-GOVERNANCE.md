# SynBio-LLVM Data Governance & Privacy Policy

**Version**: 1.0  
**Effective Date**: 2025-01-01  
**Last Reviewed**: 2025-06-16

## 1. Scope

This policy applies to all data processed by SynBio-LLVM, including:
- Genetic sequence data (DNA, RNA, protein)
- Design files (.bio, SBOL, FASTA, GenBank)
- Simulation parameters and results
- Biosafety classifications and audit trails
- User preferences and telemetry (opt-in only)

## 2. Data Classification

| Level | Category | Examples | Handling |
|-------|----------|----------|----------|
| **Public** | Open-source parts | iGEM Registry parts, standard promoters | No restrictions |
| **Internal** | Lab designs | Custom circuits, unpublished sequences | Encrypted at rest |
| **Confidential** | IP-sensitive | Novel pathways, patent-pending constructs | Encrypted + access control |
| **Restricted** | Dual-use/select agent | DURC sequences, BSL-3+ organisms | Audit trail + approval |

## 3. Data Processing Principles

### 3.1 Local-First Architecture
- **All computation runs locally** on the user's machine
- No genetic sequence data is transmitted to external servers without explicit user consent
- The Python engine (protein prediction) runs on localhost only
- ONNX models are bundled locally — no cloud inference

### 3.2 Minimal Data Collection
- **Telemetry is opt-in only** (setting: `synbio.enableTelemetry`)
- When enabled, only anonymous usage metrics are collected:
  - Feature usage counts (compile, simulate, etc.)
  - Error types (not content)
  - Extension version and VS Code version
- **Never collected**: sequence data, file contents, usernames, IP addresses

### 3.3 Data Retention
- Audit trail: Retained locally for minimum 5 years (configurable)
- Telemetry: Aggregated, anonymized, retained 12 months
- Cache: LRU with configurable TTL (default 5 min), auto-evicted

## 4. Biosafety Data Handling

### 4.1 Select Agent Sequences
- Sequences matching CDC/USDA select agent database trigger automatic flagging
- Flagged sequences are **not** transmitted externally
- Audit trail records the detection event with timestamp and hash

### 4.2 DURC Screening
- All sequences are screened against 15 DURC agent categories (NIH Policy)
- Positive matches require IBC review before export
- Export functions are blocked until acknowledgment is recorded

### 4.3 Export Controls
- SBOL/FASTA/GenBank exports are logged in the audit trail
- BSL-2+ exports include biosafety metadata in the output file
- Compliance report can be generated before institutional review

## 5. Access Control

### 5.1 Extension-Level
- No authentication required for standard features (BSL-1)
- BSL-2+ features recommend institutional credentials (future)
- Admin settings are protected by VS Code's settings sync

### 5.2 Audit Trail Integrity
- All audit entries are SHA-256 chained (tamper-evident)
- Chain verification available: `synbio.verifyAuditChain`
- Broken chain triggers a warning notification

## 6. Third-Party Dependencies

| Dependency | Purpose | Data Shared |
|-----------|---------|-------------|
| VS Code API | Extension host | None (local) |
| vscode-languageclient | LSP communication | None (local IPC) |
| ONNX Runtime | Protein prediction | None (local inference) |
| esbuild | Build tool | None |

**No external APIs, cloud services, or databases are contacted during normal operation.**

## 7. Regulatory Compliance

### 7.1 GDPR (EU)
- No personal data is processed beyond local username for audit logs
- Data subject can delete all stored data via `synbio.clearAllData` command
- No data transferred outside the user's machine

### 7.2 NIH Guidelines
- Audit trail supports IBC documentation requirements (Section IV-B)
- Biosafety classification per BMBL 6th Edition (CDC/NIH)
- DURC screening per USG Policy for Institutional DURC Oversight

### 7.3 Export Control (EAR/ITAR)
- SynBio-LLVM does not contain controlled technology
- Users are responsible for export compliance of their designs
- Audit trail can serve as evidence of screening

## 8. Incident Response

1. **Detection**: Automated chain verification, anomaly alerts
2. **Containment**: Block affected features, preserve audit trail
3. **Notification**: Alert user via VS Code notification
4. **Recovery**: Restore from last valid audit checkpoint
5. **Review**: Generate incident report for institutional review

## 9. Contact

For questions about this policy:
- GitHub Issues: https://github.com/synbio-llvm/synbio-llvm/issues
- Security Issues: See SECURITY.md

## 10. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-01 | Initial data governance policy |
