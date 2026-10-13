# Security Policy

## Reporting a Vulnerability

SynBio-LLVM is a synthetic biology tool. Security vulnerabilities — especially in the **biosecurity scanner** — could have real-world safety implications. We take all security reports extremely seriously.

### How to Report

**DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report security issues by emailing:

📧 **security@synbio-llvm.org**

Or contact the maintainer directly via GitHub private message.

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact (especially any biosafety implications)
- Suggested fix (if you have one)

### Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgment of report | Within 48 hours |
| Initial assessment | Within 1 week |
| Fix development | Within 2 weeks for critical issues |
| Public disclosure | After fix is released |

## Scope

### Critical (report immediately)

- **Biosecurity scanner bypass**: A way to design circuits with select agents without triggering a warning
- **Kill switch circumvention**: A way to compile `safe circuit` without a kill switch and without getting a diagnostic
- **BSL misassignment**: The auto-documentation assigns a lower BSL than the organism warrants
- **Data exfiltration**: The extension sends user data, sequences, or designs to external servers without consent

### Important (report via security email)

- Arbitrary code execution in WebView panels
- Path traversal in file operations
- Dependency vulnerabilities in npm/cargo/pip packages
- Denial of service in the LSP server

### Low (can use public issues)

- Minor UI bugs in WebView panels
- Incorrect but non-dangerous scientific values
- Performance issues

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Current release |

## Biosafety Commitment

SynBio-LLVM is committed to responsible innovation in synthetic biology. Our biosecurity features follow:

- **CDC/NIH BMBL 6th Edition** for BSL assignments
- **42 CFR §73** (Select Agent Regulations) for pathogen screening
- **NIH Guidelines** (April 2024) for recombinant DNA
- **EU Directive 2009/41/EC** for contained use of GMOs

If you discover that any of these compliance features are incorrect or incomplete, please report it as a **critical security issue**.

## Responsible Disclosure

We follow a coordinated disclosure process:

1. Reporter submits vulnerability privately
2. We confirm and assess the issue
3. We develop and test a fix
4. We release the fix
5. We publicly disclose the vulnerability with credit to the reporter
6. Reporter is acknowledged in CHANGELOG.md and (optionally) publicly

We will **never** take legal action against security researchers who follow responsible disclosure practices.

## Acknowledgments

We thank the following individuals for responsibly disclosing security issues:

*No reports yet — be the first to help make SynBio-LLVM safer!*
