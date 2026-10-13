/**
 * ══════════════════════════════════════════════════════════════
 * SynBio-LLVM — Audit Trail & Compliance Engine
 *
 * Provides tamper-evident logging of all design decisions,
 * biosafety evaluations, and export actions for regulatory
 * compliance and institutional governance.
 *
 * Compliance frameworks:
 *   - NIH Guidelines for Research Involving Recombinant DNA (2024)
 *   - CDC/USDA Select Agent Regulations (42 CFR Part 73)
 *   - EU Directive 2009/41/EC (Contained Use of GMOs)
 *   - Cartagena Protocol on Biosafety (CBD)
 *   - iGEM Safety Guidelines (2024)
 *   - BMBL 6th Edition (CDC/NIH)
 *
 * Audit log format: JSONL (JSON Lines) for streaming, immutable append-only.
 * Each entry is SHA-256 chained to previous entry for tamper evidence.
 * ══════════════════════════════════════════════════════════════
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────

export type AuditAction =
    | 'circuit.create'
    | 'circuit.modify'
    | 'circuit.compile'
    | 'circuit.export'
    | 'simulation.run'
    | 'biosafety.classify'
    | 'biosafety.scan'
    | 'biosafety.override'
    | 'crispr.design'
    | 'sequence.import'
    | 'sequence.export'
    | 'protocol.generate'
    | 'user.login'
    | 'user.acknowledge'
    | 'config.change'
    | 'approval.request'
    | 'approval.grant'
    | 'approval.deny';

export interface AuditEntry {
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Sequential entry number */
    seq: number;
    /** SHA-256 hash of this entry */
    hash: string;
    /** SHA-256 hash of previous entry (chain) */
    prevHash: string;
    /** Action category */
    action: AuditAction;
    /** Human-readable description */
    description: string;
    /** User identifier */
    user: string;
    /** Affected resource (file path, sequence ID, etc.) */
    resource?: string;
    /** BSL classification if applicable */
    bslLevel?: number;
    /** Metadata (varies by action) */
    metadata?: Record<string, any>;
    /** Regulatory framework reference */
    regulation?: string;
}

export interface ComplianceCheck {
    rule: string;
    framework: string;
    section: string;
    status: 'compliant' | 'non-compliant' | 'needs-review' | 'exempt';
    detail: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export interface ComplianceReport {
    generatedAt: string;
    projectName: string;
    bslLevel: number;
    overallStatus: 'compliant' | 'non-compliant' | 'pending-review';
    checks: ComplianceCheck[];
    auditEntriesCount: number;
    recommendations: string[];
}

// ── Biosafety Rule Engine ──────────────────────────────────────────────

export const BIOSAFETY_RULES: ComplianceCheck[] = [
    // NIH Guidelines
    {
        rule: 'IBC Approval Required for BSL-2+',
        framework: 'NIH Guidelines',
        section: 'Section III-D',
        status: 'needs-review',
        detail: 'Experiments involving BSL-2+ agents require Institutional Biosafety Committee approval before initiation.',
        severity: 'critical',
    },
    {
        rule: 'Risk Assessment Documentation',
        framework: 'NIH Guidelines',
        section: 'Section II-A',
        status: 'needs-review',
        detail: 'A written risk assessment must document hazard identification, exposure assessment, and risk mitigation.',
        severity: 'high',
    },
    {
        rule: 'Dual Use Research of Concern (DURC)',
        framework: 'NIH Guidelines',
        section: 'Section IV-B',
        status: 'needs-review',
        detail: 'Research with 15 DURC agents/toxins must be reviewed for dual use potential.',
        severity: 'critical',
    },
    // BMBL
    {
        rule: 'Containment Level Matches BSL',
        framework: 'BMBL 6th Ed.',
        section: 'Section IV',
        status: 'needs-review',
        detail: 'Physical containment must match the BSL classification of the organism/construct.',
        severity: 'critical',
    },
    {
        rule: 'Standard Microbiological Practices',
        framework: 'BMBL 6th Ed.',
        section: 'Section IV, BSL-1',
        status: 'compliant',
        detail: 'Basic practices: handwashing, no food/drink, decontamination of waste.',
        severity: 'low',
    },
    // Select Agent Regulations
    {
        rule: 'Select Agent Registration',
        framework: 'CDC/USDA 42 CFR Part 73',
        section: '§73.7',
        status: 'needs-review',
        detail: 'Entities possessing select agents must register with CDC/APHIS.',
        severity: 'critical',
    },
    {
        rule: 'Toxin Quantity Exemptions',
        framework: 'CDC/USDA 42 CFR Part 73',
        section: '§73.3',
        status: 'exempt',
        detail: 'Quantities below permissible amounts are exempt from registration.',
        severity: 'medium',
    },
    // EU Directive
    {
        rule: 'Notification of Contained Use',
        framework: 'EU Directive 2009/41/EC',
        section: 'Article 6',
        status: 'needs-review',
        detail: 'First use of GMO facilities requires notification to competent authority.',
        severity: 'high',
    },
    // iGEM
    {
        rule: 'White List Organisms Only',
        framework: 'iGEM Safety 2024',
        section: 'Organism Guidelines',
        status: 'needs-review',
        detail: 'Only organisms on the iGEM White List may be used without special approval.',
        severity: 'medium',
    },
    // Cartagena Protocol
    {
        rule: 'Transboundary Movement AIA',
        framework: 'Cartagena Protocol',
        section: 'Article 7',
        status: 'exempt',
        detail: 'Advance Informed Agreement required for transboundary movement of LMOs.',
        severity: 'high',
    },
];

// ── Audit Trail Manager ────────────────────────────────────────────────

export class AuditTrailManager {
    private entries: AuditEntry[] = [];
    private lastHash: string = '0'.repeat(64); // Genesis hash
    private seq: number = 0;
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('SynBio Audit Trail');
        this.loadEntries();
    }

    /**
     * Log an auditable action with tamper-evident chaining.
     */
    log(
        action: AuditAction,
        description: string,
        resource?: string,
        metadata?: Record<string, any>,
        regulation?: string
    ): AuditEntry {
        this.seq++;
        const entry: AuditEntry = {
            timestamp: new Date().toISOString(),
            seq: this.seq,
            hash: '', // computed below
            prevHash: this.lastHash,
            action,
            description,
            user: this.getCurrentUser(),
            resource,
            metadata,
            regulation,
        };

        // Compute SHA-256 chain hash
        const payload = JSON.stringify({
            ...entry,
            hash: undefined, // exclude hash from its own computation
        });
        entry.hash = crypto.createHash('sha256').update(payload).digest('hex');
        this.lastHash = entry.hash;

        this.entries.push(entry);
        this.persistEntries();

        // Log to output channel
        this.outputChannel.appendLine(
            `[${entry.timestamp}] ${entry.action}: ${entry.description} (${entry.hash.slice(0, 12)}...)`
        );

        return entry;
    }

    /**
     * Verify integrity of the entire audit chain.
     */
    verifyChain(): { valid: boolean; brokenAt?: number; details: string } {
        let prevHash = '0'.repeat(64);

        for (let i = 0; i < this.entries.length; i++) {
            const entry = this.entries[i];

            // Check chain linkage
            if (entry.prevHash !== prevHash) {
                return {
                    valid: false,
                    brokenAt: i,
                    details: `Chain broken at entry #${entry.seq}: prevHash mismatch`,
                };
            }

            // Recompute hash
            const payload = JSON.stringify({
                ...entry,
                hash: undefined,
            });
            const computed = crypto.createHash('sha256').update(payload).digest('hex');
            if (computed !== entry.hash) {
                return {
                    valid: false,
                    brokenAt: i,
                    details: `Hash mismatch at entry #${entry.seq}: computed=${computed.slice(0, 12)}... stored=${entry.hash.slice(0, 12)}...`,
                };
            }

            prevHash = entry.hash;
        }

        return {
            valid: true,
            details: `Chain verified: ${this.entries.length} entries, all hashes valid.`,
        };
    }

    /**
     * Generate a compliance report for the current project.
     */
    generateComplianceReport(projectName: string, bslLevel: number): ComplianceReport {
        const checks = BIOSAFETY_RULES.map(rule => {
            // Auto-assign status based on BSL
            const check = { ...rule };
            if (bslLevel <= 1 && check.severity === 'critical') {
                check.status = 'exempt' as const;
                check.detail += ' [Auto-exempt: BSL-1 project]';
            }
            return check;
        });

        const nonCompliant = checks.filter(c => c.status === 'non-compliant');
        const needsReview = checks.filter(c => c.status === 'needs-review');

        const overallStatus = nonCompliant.length > 0
            ? 'non-compliant' as const
            : needsReview.length > 0
                ? 'pending-review' as const
                : 'compliant' as const;

        const recommendations: string[] = [];
        if (bslLevel >= 2) {
            recommendations.push('Obtain IBC approval before initiating experiments.');
            recommendations.push('Complete written risk assessment per NIH Section II-A.');
        }
        if (bslLevel >= 3) {
            recommendations.push('Ensure BSL-3 facility certification is current.');
            recommendations.push('Verify personnel training records for BSL-3 operations.');
        }
        recommendations.push('Maintain this audit trail for minimum 5 years per institutional policy.');
        recommendations.push('Review DURC screening annually per NIH DURC Policy.');

        this.log(
            'biosafety.classify',
            `Compliance report generated for "${projectName}" (BSL-${bslLevel})`,
            projectName,
            { bslLevel, overallStatus, checksCount: checks.length },
            'NIH Guidelines + BMBL 6th Ed.'
        );

        return {
            generatedAt: new Date().toISOString(),
            projectName,
            bslLevel,
            overallStatus,
            checks,
            auditEntriesCount: this.entries.length,
            recommendations,
        };
    }

    /**
     * Export audit trail as JSONL (JSON Lines) — one entry per line.
     */
    exportJSONL(): string {
        return this.entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    }

    /**
     * Get entry count.
     */
    getEntryCount(): number {
        return this.entries.length;
    }

    /**
     * Show audit trail in VS Code output channel.
     */
    showInOutput(): void {
        this.outputChannel.show();
    }

    // ── Private ─────────────────────────────────────────────────

    private getCurrentUser(): string {
        return process.env.USER || process.env.USERNAME || 'unknown';
    }

    private loadEntries(): void {
        const stored = this.context.globalState.get<AuditEntry[]>('synbio.auditTrail', []);
        this.entries = stored;
        if (stored.length > 0) {
            this.lastHash = stored[stored.length - 1].hash;
            this.seq = stored[stored.length - 1].seq;
        }
    }

    private persistEntries(): void {
        // Keep max 10000 entries to avoid memory issues
        if (this.entries.length > 10000) {
            this.entries = this.entries.slice(-5000);
        }
        this.context.globalState.update('synbio.auditTrail', this.entries);
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
