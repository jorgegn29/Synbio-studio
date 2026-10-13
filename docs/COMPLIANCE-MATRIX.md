# SynBio-LLVM Regulatory Compliance Matrix

**Version**: 1.0 | **Date**: 2025-06-16

## Overview

This matrix maps SynBio-LLVM features to applicable regulations and demonstrates
how the extension supports compliance at each BSL level.

## Compliance Matrix

### BSL-1 Projects (Non-pathogenic organisms)

| Requirement | Regulation | SynBio-LLVM Feature | Status |
|------------|-----------|---------------------|--------|
| Standard microbiological practices | BMBL 6th Ed. Section IV | Biosafety Classifier | ✅ Automated |
| Lab-specific biosafety manual | BMBL 6th Ed. Section IV | Compliance Report Generation | ✅ Supported |
| White-list organism verification | iGEM Safety 2024 | BSL Classifier (12 organisms) | ✅ Automated |
| Sequence documentation | Good Scientific Practice | Audit Trail + Export | ✅ Automated |

### BSL-2 Projects (Moderate-risk agents)

| Requirement | Regulation | SynBio-LLVM Feature | Status |
|------------|-----------|---------------------|--------|
| IBC approval before experiments | NIH Guidelines III-D | Audit Trail `approval.request` | ✅ Tracked |
| Written risk assessment | NIH Guidelines II-A | Compliance Report | ✅ Generated |
| Restricted access documentation | BMBL 6th Ed. Section IV | Audit Trail chain | ✅ Tamper-evident |
| Biosafety cabinet use required | BMBL 6th Ed. Section IV | Protocol Generator (safety notes) | ✅ Included |
| Medical surveillance program | OSHA 29 CFR 1910.1030 | Compliance Report recommendation | ✅ Flagged |
| Decontamination procedures | BMBL 6th Ed. Section IV | Protocol Generator | ✅ Included |

### BSL-3 Projects (Serious/lethal agents)

| Requirement | Regulation | SynBio-LLVM Feature | Status |
|------------|-----------|---------------------|--------|
| Select agent registration | 42 CFR Part 73 §73.7 | Biosecurity Scanner (40+ agents) | ✅ Automated screening |
| Facility certification | BMBL 6th Ed. Section IV | Compliance Report | ⚠️ Flagged (external) |
| Personnel training records | 42 CFR Part 73 §73.15 | Audit Trail | ✅ Trackable |
| DURC screening | USG DURC Policy 2014 | Biosecurity Scanner (15 categories) | ✅ Automated |
| Incident reporting | 42 CFR Part 73 §73.19 | Audit Trail + Export | ✅ Available |

### International Regulations

| Requirement | Regulation | SynBio-LLVM Feature | Status |
|------------|-----------|---------------------|--------|
| Contained use notification | EU 2009/41/EC Art. 6 | Compliance Report | ⚠️ Flagged |
| Risk assessment classes 1-4 | EU 2009/41/EC Art. 4 | BSL Classifier mapping | ✅ Automated |
| AIA for transboundary movement | Cartagena Protocol Art. 7 | Export audit logging | ✅ Tracked |
| Living Modified Organism (LMO) documentation | Cartagena Protocol Art. 18 | SBOL 3.0 export + metadata | ✅ Supported |

## Audit Trail Requirements

The audit trail system provides:

1. **Tamper Evidence**: SHA-256 hash chain — each entry hashes the previous entry
2. **Non-repudiation**: User identification + timestamp on every action
3. **Completeness**: All biosafety-relevant actions are logged automatically
4. **Retention**: Configurable retention (default: 5 years, minimum for NIH)
5. **Exportability**: JSONL format for institutional review systems

## Feature-to-Regulation Mapping

```
synbio.compile        → Audit log + SBOL metadata
synbio.simulate       → Audit log (parameters recorded)
synbio.classifyBSL    → BMBL 6th Ed. + Audit log
synbio.biosecScan     → 42 CFR 73 + NIH DURC + iGEM Safety
synbio.exportSBOL     → Cartagena Protocol + Export control
synbio.generateProtocol → BMBL practices + NEB kit references
synbio.designRuleCheck → Salis 2009, Chen 2013, Mutalik 2013
```

## Biosafety Rule Versioning

| Rule Set | Version | Date | Source |
|----------|---------|------|--------|
| BMBL | 6th Edition | 2020 | CDC/NIH |
| NIH Guidelines | April 2024 | 2024 | NIH OBA |
| Select Agent List | Current | 2024 | CDC/APHIS |
| DURC Categories | USG Policy | 2014 | OSTP |
| iGEM Safety | 2024 Season | 2024 | iGEM Foundation |
| EU GMO Directive | 2009/41/EC | 2009 | European Parliament |
| Cartagena Protocol | 2003 Entry | 2003 | CBD Secretariat |

## References

1. BMBL 6th Ed.: https://www.cdc.gov/labs/BMBL.html
2. NIH Guidelines: https://osp.od.nih.gov/biotechnology/nih-guidelines/
3. Select Agent Regulations: https://www.selectagents.gov/
4. EU Directive 2009/41/EC: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0041
5. Cartagena Protocol: https://bch.cbd.int/protocol
6. iGEM Safety: https://responsibility.igem.org/
