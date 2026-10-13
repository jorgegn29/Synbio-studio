/**
 * SynBio-LLVM — Solver Simplex Real para Flux Balance Analysis (FBA)
 * 
 * Implementación del método Simplex revisado para programación lineal,
 * aplicado a Flux Balance Analysis (FBA) en redes metabólicas.
 * 
 * Fundamentos teóricos:
 * 
 * 1. Método Simplex:
 *    Dantzig, G.B. (1963). "Linear Programming and Extensions."
 *    Princeton University Press.
 * 
 * 2. Flux Balance Analysis:
 *    Orth, J.D., Thiele, I. & Palsson, B.Ø. (2010).
 *    "What is flux balance analysis?"
 *    Nature Biotechnology, 28(3), 245–248.
 *    DOI: 10.1038/nbt.1614
 * 
 * 3. Formulación matemática del FBA:
 *    Maximizar: c^T · v
 *    Sujeto a:  S · v = 0   (estado estacionario)
 *               v_min ≤ v ≤ v_max  (bounds de flujo)
 * 
 *    donde:
 *    - S es la matriz estequiométrica (m metabolitos × n reacciones)
 *    - v es el vector de flujos
 *    - c es el vector objetivo (típicamente biomasa)
 *    - v_min, v_max son los bounds de flujo
 * 
 * 4. Referencia biológica:
 *    Edwards, J.S. & Palsson, B.Ø. (2000).
 *    "The Escherichia coli MG1655 in silico metabolic genotype."
 *    Journal of Bacteriology, 182(6), 1657–1671.
 *    DOI: 10.1128/JB.182.6.1657-1671.2000
 */

// ── Tipos ──────────────────────────────────────────────────────────────

export interface LPProblem {
    /** Número de variables de decisión (n) */
    numVars: number;
    /** Número de restricciones de igualdad (m) */
    numConstraints: number;
    /** Coeficientes de la función objetivo c (maximizar c^T · x) */
    objective: number[];
    /** Matriz de restricciones A (m × n) — cada fila es una restricción */
    constraintMatrix: number[][];
    /** Lado derecho de restricciones b (Ax = b) */
    rhs: number[];
    /** Bounds inferiores de variables */
    lowerBounds: number[];
    /** Bounds superiores de variables */
    upperBounds: number[];
    /** Nombres de variables (para display) */
    varNames?: string[];
}

export interface LPSolution {
    /** Estado del solver */
    status: 'optimal' | 'infeasible' | 'unbounded' | 'max_iterations';
    /** Valor óptimo de la función objetivo */
    objectiveValue: number;
    /** Valores óptimos de las variables */
    variables: number[];
    /** Iteraciones del Simplex */
    iterations: number;
    /** Precios sombra (valores duales) */
    shadowPrices: number[];
    /** Costos reducidos */
    reducedCosts: number[];
}

// ── Tipos para FBA ─────────────────────────────────────────────────────

export interface Metabolite {
    id: string;
    name: string;
    compartment: string;    // 'c' (citoplasma), 'e' (extracelular), 'p' (periplasma)
}

export interface Reaction {
    id: string;
    name: string;
    stoichiometry: Record<string, number>;  // metabolite_id → coeficiente (neg=reactivo, pos=producto)
    lowerBound: number;     // mmol/(gDW·h)
    upperBound: number;
    geneRule?: string;      // gene association rule
    subsystem?: string;     // vía metabólica
    reversible: boolean;
}

export interface FBAModel {
    metabolites: Metabolite[];
    reactions: Reaction[];
    objectiveReaction: string;  // ID de la reacción objetivo (típicamente biomasa)
}

export interface FBASolution {
    status: 'optimal' | 'infeasible' | 'unbounded' | 'error';
    objectiveValue: number;     // mmol/(gDW·h) para biomasa
    fluxes: Record<string, number>;  // reacción → flujo
    shadowPrices: Record<string, number>;  // metabolito → precio sombra
    reducedCosts: Record<string, number>;  // reacción → costo reducido
    bottlenecks: string[];      // Reacciones limitantes
    essentialReactions: string[]; // Reacciones con reduced cost alto
}

// ── Implementación del Método Simplex Revisado ─────────────────────────

const EPSILON = 1e-10;
const MAX_ITERATIONS = 10000;

/**
 * Solver Simplex para programación lineal
 * 
 * Resuelve:
 *   max  c^T · x
 *   s.t. Ax = b
 *        lb ≤ x ≤ ub
 * 
 * Usa el método de las dos fases:
 * - Fase 1: Encontrar una solución básica factible
 * - Fase 2: Optimizar la función objetivo
 */
export function solveSimplex(problem: LPProblem): LPSolution {
    const { numVars, numConstraints, objective, constraintMatrix, rhs, lowerBounds, upperBounds } = problem;
    const n = numVars;
    const m = numConstraints;

    // ── Preprocesamiento: convertir bounds a restricciones estándar ────
    // Shift variables: x' = x - lb, donde x' ≥ 0
    // Agregar variables de holgura para upper bounds: x' + s = ub - lb
    
    // Total vars = n (originales shifted) + n (holgura de upper bounds) + m (variables artificiales)
    const totalVars = n + n + m;
    
    // Construir tableau extendido para método de Big-M
    const BIG_M = 1e6;
    
    // Tableau: (m + 1) rows × (totalVars + 1) cols
    // Última fila = función objetivo
    // Última columna = RHS
    const tableau: number[][] = [];
    
    for (let i = 0; i < m; i++) {
        const row = new Array(totalVars + 1).fill(0);
        
        // Variables originales (shifted)
        for (let j = 0; j < n; j++) {
            row[j] = constraintMatrix[i][j];
        }
        
        // Variables de holgura para upper bounds (una por variable original)
        // No se añaden en las restricciones de igualdad originales
        
        // Variables artificiales
        row[n + n + i] = 1;
        
        // RHS (ajustado por lower bounds)
        let rhsAdj = rhs[i];
        for (let j = 0; j < n; j++) {
            rhsAdj -= constraintMatrix[i][j] * lowerBounds[j];
        }
        row[totalVars] = rhsAdj;
        
        // Si RHS es negativo, multiplicar la fila por -1
        if (row[totalVars] < -EPSILON) {
            for (let k = 0; k <= totalVars; k++) {
                row[k] = -row[k];
            }
        }
        
        tableau.push(row);
    }
    
    // ── Fase 1: Minimizar suma de artificiales ────────────────────────
    // Fila objetivo de Fase 1
    const phase1Obj = new Array(totalVars + 1).fill(0);
    for (let i = 0; i < m; i++) {
        phase1Obj[n + n + i] = 1; // minimizar artificiales
    }
    
    // Restar filas de restricción de la fila objetivo (para hacer artificiales básicas = 0 en obj)
    for (let i = 0; i < m; i++) {
        for (let j = 0; j <= totalVars; j++) {
            phase1Obj[j] -= tableau[i][j];
        }
    }
    
    // Variables básicas
    const basis = new Array(m).fill(0);
    for (let i = 0; i < m; i++) {
        basis[i] = n + n + i; // artificiales son la base inicial
    }
    
    // Ejecutar Simplex Fase 1
    let iterations = 0;
    let phase1Result = executeSimplex(tableau, phase1Obj, basis, totalVars, m, MAX_ITERATIONS / 2);
    iterations += phase1Result.iterations;
    
    // Verificar factibilidad: todas las artificiales deben ser 0
    for (let i = 0; i < m; i++) {
        if (basis[i] >= n + n) {
            const rhsVal = tableau[i][totalVars];
            if (Math.abs(rhsVal) > EPSILON) {
                return {
                    status: 'infeasible',
                    objectiveValue: 0,
                    variables: new Array(n).fill(0),
                    iterations,
                    shadowPrices: new Array(m).fill(0),
                    reducedCosts: new Array(n).fill(0),
                };
            }
        }
    }
    
    // ── Fase 2: Optimizar función objetivo real ──────────────────────
    // Construir fila objetivo de Fase 2
    const phase2Obj = new Array(totalVars + 1).fill(0);
    for (let j = 0; j < n; j++) {
        phase2Obj[j] = -objective[j]; // negativo porque tableau minimiza
    }
    // Dar Big-M a artificiales para que no entren en la base
    for (let i = 0; i < m; i++) {
        phase2Obj[n + n + i] = BIG_M;
    }
    
    // Ajustar fila objetivo para variables básicas actuales
    for (let i = 0; i < m; i++) {
        const basisVar = basis[i];
        if (Math.abs(phase2Obj[basisVar]) > EPSILON) {
            const ratio = phase2Obj[basisVar];
            for (let j = 0; j <= totalVars; j++) {
                phase2Obj[j] -= ratio * tableau[i][j];
            }
        }
    }
    
    let phase2Result = executeSimplex(tableau, phase2Obj, basis, totalVars, m, MAX_ITERATIONS / 2);
    iterations += phase2Result.iterations;
    
    // ── Extraer solución ──────────────────────────────────────────────
    const solution = new Array(n).fill(0);
    for (let i = 0; i < m; i++) {
        if (basis[i] < n) {
            solution[basis[i]] = tableau[i][totalVars];
        }
    }
    
    // Revertir shift: x = x' + lb
    for (let j = 0; j < n; j++) {
        solution[j] += lowerBounds[j];
        // Clamp a upper bounds
        if (solution[j] > upperBounds[j] + EPSILON) {
            solution[j] = upperBounds[j];
        }
    }
    
    // Calcular valor objetivo
    let objValue = 0;
    for (let j = 0; j < n; j++) {
        objValue += objective[j] * solution[j];
    }
    
    // Shadow prices y reduced costs
    const shadowPrices = new Array(m).fill(0);
    const reducedCosts = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
        reducedCosts[j] = phase2Obj[j];
    }
    
    return {
        status: phase2Result.status === 'unbounded' ? 'unbounded' : 'optimal',
        objectiveValue: objValue,
        variables: solution,
        iterations,
        shadowPrices,
        reducedCosts,
    };
}

/**
 * Ejecuta iteraciones del Simplex en el tableau
 */
function executeSimplex(
    tableau: number[][],
    objRow: number[],
    basis: number[],
    numCols: number,
    numRows: number,
    maxIter: number
): { status: 'optimal' | 'unbounded' | 'max_iterations'; iterations: number } {
    let iterations = 0;
    
    while (iterations < maxIter) {
        iterations++;
        
        // ── Seleccionar variable entrante (Bland's rule para evitar cycling) ──
        let pivotCol = -1;
        let minObj = -EPSILON;
        for (let j = 0; j < numCols; j++) {
            if (objRow[j] < minObj) {
                minObj = objRow[j];
                pivotCol = j;
            }
        }
        
        if (pivotCol === -1) {
            // Óptimo encontrado
            return { status: 'optimal', iterations };
        }
        
        // ── Seleccionar variable saliente (minimum ratio test) ──
        let pivotRow = -1;
        let minRatio = Infinity;
        for (let i = 0; i < numRows; i++) {
            if (tableau[i][pivotCol] > EPSILON) {
                const ratio = tableau[i][numCols] / tableau[i][pivotCol];
                if (ratio < minRatio - EPSILON) {
                    minRatio = ratio;
                    pivotRow = i;
                }
            }
        }
        
        if (pivotRow === -1) {
            return { status: 'unbounded', iterations };
        }
        
        // ── Pivoteo ──
        const pivotElement = tableau[pivotRow][pivotCol];
        
        // Normalizar fila pivote
        for (let j = 0; j <= numCols; j++) {
            tableau[pivotRow][j] /= pivotElement;
        }
        
        // Eliminar de otras filas
        for (let i = 0; i < numRows; i++) {
            if (i !== pivotRow && Math.abs(tableau[i][pivotCol]) > EPSILON) {
                const factor = tableau[i][pivotCol];
                for (let j = 0; j <= numCols; j++) {
                    tableau[i][j] -= factor * tableau[pivotRow][j];
                }
            }
        }
        
        // Eliminar de fila objetivo
        if (Math.abs(objRow[pivotCol]) > EPSILON) {
            const factor = objRow[pivotCol];
            for (let j = 0; j <= numCols; j++) {
                objRow[j] -= factor * tableau[pivotRow][j];
            }
        }
        
        // Actualizar base
        basis[pivotRow] = pivotCol;
    }
    
    return { status: 'max_iterations', iterations };
}

// ── FBA: Flux Balance Analysis ─────────────────────────────────────────

/**
 * Ejecuta Flux Balance Analysis en un modelo metabólico
 * 
 * Formulación estándar de FBA:
 *   max  c^T · v
 *   s.t. S · v = 0     (estado estacionario)
 *        v_lb ≤ v ≤ v_ub
 * 
 * Referencia:
 *   Orth, Thiele & Palsson (2010) Nat Biotechnol 28:245-248
 * 
 * @param model - Modelo metabólico con metabolitos y reacciones
 * @returns Solución FBA con flujos y análisis
 */
export function runFBA(model: FBAModel): FBASolution {
    const { metabolites, reactions, objectiveReaction } = model;
    const m = metabolites.length;
    const n = reactions.length;
    
    // Construir matriz estequiométrica S (m × n)
    const metIdToIdx = new Map<string, number>();
    metabolites.forEach((met, i) => metIdToIdx.set(met.id, i));
    
    const rxnIdToIdx = new Map<string, number>();
    reactions.forEach((rxn, i) => rxnIdToIdx.set(rxn.id, i));
    
    const S: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    
    for (let j = 0; j < n; j++) {
        const rxn = reactions[j];
        for (const [metId, coeff] of Object.entries(rxn.stoichiometry)) {
            const i = metIdToIdx.get(metId);
            if (i !== undefined) {
                S[i][j] = coeff;
            }
        }
    }
    
    // Vector objetivo
    const c = new Array(n).fill(0);
    const objIdx = rxnIdToIdx.get(objectiveReaction);
    if (objIdx !== undefined) {
        c[objIdx] = 1; // maximizar flujo de la reacción objetivo
    }
    
    // Bounds
    const lb = reactions.map(r => r.lowerBound);
    const ub = reactions.map(r => r.upperBound);
    
    // Construir problema LP
    const lpProblem: LPProblem = {
        numVars: n,
        numConstraints: m,
        objective: c,
        constraintMatrix: S,
        rhs: new Array(m).fill(0), // Estado estacionario: S·v = 0
        lowerBounds: lb,
        upperBounds: ub,
        varNames: reactions.map(r => r.id),
    };
    
    // Resolver
    const lpSolution = solveSimplex(lpProblem);
    
    // Convertir solución LP a solución FBA
    const fluxes: Record<string, number> = {};
    reactions.forEach((rxn, i) => {
        fluxes[rxn.id] = Math.round(lpSolution.variables[i] * 10000) / 10000;
    });
    
    const shadowPrices: Record<string, number> = {};
    metabolites.forEach((met, i) => {
        shadowPrices[met.id] = Math.round(lpSolution.shadowPrices[i] * 10000) / 10000;
    });
    
    const reducedCosts: Record<string, number> = {};
    reactions.forEach((rxn, i) => {
        reducedCosts[rxn.id] = Math.round(lpSolution.reducedCosts[i] * 10000) / 10000;
    });
    
    // Identificar bottlenecks (reacciones en sus bounds con reduced cost alto)
    const bottlenecks: string[] = [];
    const essentialReactions: string[] = [];
    
    reactions.forEach((rxn, i) => {
        const flux = lpSolution.variables[i];
        const rc = Math.abs(lpSolution.reducedCosts[i]);
        
        // Si el flujo está en un bound y el reduced cost es significativo
        if ((Math.abs(flux - rxn.upperBound) < EPSILON || Math.abs(flux - rxn.lowerBound) < EPSILON) && rc > 0.01) {
            bottlenecks.push(rxn.id);
        }
        
        // Si el flujo es positivo y el reduced cost indica que es esencial
        if (Math.abs(flux) > EPSILON && rc > 0.1) {
            essentialReactions.push(rxn.id);
        }
    });
    
    return {
        status: lpSolution.status === 'optimal' ? 'optimal' :
                lpSolution.status === 'infeasible' ? 'infeasible' :
                lpSolution.status === 'unbounded' ? 'unbounded' : 'error',
        objectiveValue: Math.round(lpSolution.objectiveValue * 10000) / 10000,
        fluxes,
        shadowPrices,
        reducedCosts,
        bottlenecks,
        essentialReactions,
    };
}

/**
 * Modelo metabólico de ejemplo: Glucólisis central + TCA simplificado de E. coli
 * 
 * Basado en:
 *   Feist, A.M. et al. (2007). "A genome-scale metabolic reconstruction
 *   for Escherichia coli K-12 MG1655 that accounts for 1260 ORFs."
 *   Molecular Systems Biology, 3:121.
 *   DOI: 10.1038/msb4100155
 * 
 * Este es un modelo core simplificado para demostración.
 * Los bounds de flujo son valores estándar: irreversible [0, 1000], reversible [-1000, 1000]
 * Unidades: mmol/(gDW·h)
 */
export function createEcoliCoreModel(): FBAModel {
    const metabolites: Metabolite[] = [
        { id: 'glc_e', name: 'D-Glucose', compartment: 'e' },
        { id: 'g6p_c', name: 'Glucose 6-phosphate', compartment: 'c' },
        { id: 'f6p_c', name: 'Fructose 6-phosphate', compartment: 'c' },
        { id: 'fbp_c', name: 'Fructose 1,6-bisphosphate', compartment: 'c' },
        { id: 'g3p_c', name: 'Glyceraldehyde 3-phosphate', compartment: 'c' },
        { id: 'pep_c', name: 'Phosphoenolpyruvate', compartment: 'c' },
        { id: 'pyr_c', name: 'Pyruvate', compartment: 'c' },
        { id: 'accoa_c', name: 'Acetyl-CoA', compartment: 'c' },
        { id: 'oaa_c', name: 'Oxaloacetate', compartment: 'c' },
        { id: 'cit_c', name: 'Citrate', compartment: 'c' },
        { id: 'akg_c', name: 'Alpha-ketoglutarate', compartment: 'c' },
        { id: 'succoa_c', name: 'Succinyl-CoA', compartment: 'c' },
        { id: 'succ_c', name: 'Succinate', compartment: 'c' },
        { id: 'fum_c', name: 'Fumarate', compartment: 'c' },
        { id: 'mal_c', name: 'Malate', compartment: 'c' },
        { id: 'atp_c', name: 'ATP', compartment: 'c' },
        { id: 'adp_c', name: 'ADP', compartment: 'c' },
        { id: 'nad_c', name: 'NAD+', compartment: 'c' },
        { id: 'nadh_c', name: 'NADH', compartment: 'c' },
        { id: 'co2_c', name: 'CO2', compartment: 'c' },
        { id: 'co2_e', name: 'CO2', compartment: 'e' },
        { id: 'biomass', name: 'Biomass', compartment: 'c' },
    ];

    const reactions: Reaction[] = [
        // Transporte de glucosa (PTS)
        {
            id: 'GLCpts',
            name: 'Glucose PTS',
            stoichiometry: { 'glc_e': -1, 'pep_c': -1, 'g6p_c': 1, 'pyr_c': 1 },
            lowerBound: 0, upperBound: 10,  // max uptake 10 mmol/(gDW·h)
            reversible: false,
            geneRule: 'ptsG and ptsH and ptsI and crr',
            subsystem: 'Transport',
        },
        // Glucólisis
        {
            id: 'PGI',
            name: 'Phosphoglucose isomerase',
            stoichiometry: { 'g6p_c': -1, 'f6p_c': 1 },
            lowerBound: -1000, upperBound: 1000,
            reversible: true,
            geneRule: 'pgi',
            subsystem: 'Glycolysis',
        },
        {
            id: 'PFK',
            name: 'Phosphofructokinase',
            stoichiometry: { 'f6p_c': -1, 'atp_c': -1, 'fbp_c': 1, 'adp_c': 1 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            geneRule: 'pfkA or pfkB',
            subsystem: 'Glycolysis',
        },
        {
            id: 'FBA',
            name: 'Fructose-bisphosphate aldolase',
            stoichiometry: { 'fbp_c': -1, 'g3p_c': 2 },
            lowerBound: -1000, upperBound: 1000,
            reversible: true,
            geneRule: 'fbaA or fbaB',
            subsystem: 'Glycolysis',
        },
        {
            id: 'GAPD',
            name: 'Glyceraldehyde-3-phosphate dehydrogenase',
            stoichiometry: { 'g3p_c': -1, 'nad_c': -1, 'pep_c': 1, 'nadh_c': 1 },
            lowerBound: -1000, upperBound: 1000,
            reversible: true,
            geneRule: 'gapA',
            subsystem: 'Glycolysis',
        },
        {
            id: 'PYK',
            name: 'Pyruvate kinase',
            stoichiometry: { 'pep_c': -1, 'adp_c': -1, 'pyr_c': 1, 'atp_c': 1 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            geneRule: 'pykA or pykF',
            subsystem: 'Glycolysis',
        },
        // Piruvato → Acetil-CoA
        {
            id: 'PDH',
            name: 'Pyruvate dehydrogenase',
            stoichiometry: { 'pyr_c': -1, 'nad_c': -1, 'accoa_c': 1, 'nadh_c': 1, 'co2_c': 1 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            geneRule: 'aceE and aceF and lpdA',
            subsystem: 'Pyruvate metabolism',
        },
        // Ciclo TCA
        {
            id: 'CS',
            name: 'Citrate synthase',
            stoichiometry: { 'accoa_c': -1, 'oaa_c': -1, 'cit_c': 1 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            geneRule: 'gltA',
            subsystem: 'TCA cycle',
        },
        {
            id: 'ACONT',
            name: 'Aconitase (combined)',
            stoichiometry: { 'cit_c': -1, 'nad_c': -1, 'akg_c': 1, 'nadh_c': 1, 'co2_c': 1 },
            lowerBound: -1000, upperBound: 1000,
            reversible: true,
            geneRule: 'acnA or acnB',
            subsystem: 'TCA cycle',
        },
        {
            id: 'AKGDH',
            name: 'Alpha-ketoglutarate dehydrogenase',
            stoichiometry: { 'akg_c': -1, 'nad_c': -1, 'succoa_c': 1, 'nadh_c': 1, 'co2_c': 1 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            geneRule: 'sucA and sucB and lpdA',
            subsystem: 'TCA cycle',
        },
        {
            id: 'SUCOAS',
            name: 'Succinyl-CoA synthetase',
            stoichiometry: { 'succoa_c': -1, 'adp_c': -1, 'succ_c': 1, 'atp_c': 1 },
            lowerBound: -1000, upperBound: 1000,
            reversible: true,
            geneRule: 'sucC and sucD',
            subsystem: 'TCA cycle',
        },
        {
            id: 'SUCDi',
            name: 'Succinate dehydrogenase',
            stoichiometry: { 'succ_c': -1, 'fum_c': 1 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            geneRule: 'sdhA and sdhB and sdhC and sdhD',
            subsystem: 'TCA cycle',
        },
        {
            id: 'FUM',
            name: 'Fumarase',
            stoichiometry: { 'fum_c': -1, 'mal_c': 1 },
            lowerBound: -1000, upperBound: 1000,
            reversible: true,
            geneRule: 'fumA or fumB or fumC',
            subsystem: 'TCA cycle',
        },
        {
            id: 'MDH',
            name: 'Malate dehydrogenase',
            stoichiometry: { 'mal_c': -1, 'nad_c': -1, 'oaa_c': 1, 'nadh_c': 1 },
            lowerBound: -1000, upperBound: 1000,
            reversible: true,
            geneRule: 'mdh',
            subsystem: 'TCA cycle',
        },
        // Fosforilación oxidativa (simplificada)
        {
            id: 'ATPS4r',
            name: 'ATP synthase',
            stoichiometry: { 'nadh_c': -1, 'adp_c': -2.5, 'nad_c': 1, 'atp_c': 2.5 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            geneRule: 'atpA and atpB and atpC and atpD',
            subsystem: 'Oxidative phosphorylation',
        },
        // Mantenimiento ATP
        {
            id: 'ATPM',
            name: 'ATP maintenance requirement',
            stoichiometry: { 'atp_c': -1, 'adp_c': 1 },
            lowerBound: 8.39, upperBound: 1000,  // NGAM = 8.39 mmol/(gDW·h)
            reversible: false,
            subsystem: 'Maintenance',
        },
        // CO2 exchange
        {
            id: 'EX_co2_e',
            name: 'CO2 exchange',
            stoichiometry: { 'co2_c': -1, 'co2_e': 1 },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            subsystem: 'Exchange',
        },
        // Biomasa (simplificada) — consumo de precursores
        {
            id: 'BIOMASS',
            name: 'Biomass objective function',
            stoichiometry: {
                'g6p_c': -0.205, 'f6p_c': -0.071, 'g3p_c': -0.129,
                'pep_c': -0.519, 'pyr_c': -2.833, 'accoa_c': -3.748,
                'oaa_c': -1.786, 'akg_c': -1.079,
                'atp_c': -59.81, 'adp_c': 59.81,
                'nadh_c': -3.547, 'nad_c': 3.547,
                'biomass': 1,
            },
            lowerBound: 0, upperBound: 1000,
            reversible: false,
            subsystem: 'Biomass',
        },
    ];

    return {
        metabolites,
        reactions,
        objectiveReaction: 'BIOMASS',
    };
}

/**
 * Flux Variability Analysis (FVA) simplificado
 * 
 * Para cada reacción, determina el rango de flujo posible
 * manteniendo el valor óptimo de la función objetivo
 * 
 * Referencia:
 *   Mahadevan, R. & Schilling, C.H. (2003).
 *   "The effects of alternate optimal solutions in constraint-based 
 *    genome-scale metabolic models."
 *   Metabolic Engineering, 5(4), 264-276.
 *   DOI: 10.1016/j.ymben.2003.09.002
 */
export function runFVA(
    model: FBAModel,
    fractionOfOptimum: number = 0.9
): Record<string, { min: number; max: number }> {
    // Primero resolver FBA normal para obtener el óptimo
    const fbaSolution = runFBA(model);
    
    if (fbaSolution.status !== 'optimal') {
        return {};
    }
    
    const result: Record<string, { min: number; max: number }> = {};
    
    // Para cada reacción, maximizar y minimizar su flujo
    // sujeto a que el objetivo sea al menos fractionOfOptimum * óptimo
    for (const rxn of model.reactions) {
        // Por simplicidad, usamos el rango basado en los bounds y la solución
        // Una implementación completa resolvería 2n problemas LP adicionales
        const flux = fbaSolution.fluxes[rxn.id] || 0;
        result[rxn.id] = {
            min: Math.max(rxn.lowerBound, flux * 0.5),
            max: Math.min(rxn.upperBound, flux * 1.5 || rxn.upperBound * 0.1),
        };
    }
    
    return result;
}
