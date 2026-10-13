// ============================================================
// Pre-loaded BioScript Examples for the Web Demo
// Each demonstrates different genetic circuit capabilities
// ============================================================

export interface Example {
  id: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tags: string[];
  icon: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'hello-bio',
    title: 'Hello Biology',
    description: 'El circuito más simple: un promotor constitutivo expresando GFP. Perfecto para empezar.',
    difficulty: 'Beginner',
    tags: ['GFP', 'constitutive', 'basic'],
    icon: '🧬',
    code: `// ═══════════════════════════════════════════════════════════
// Hello Biology — Tu primer circuito genético
// SynBio-LLVM Demo
// ═══════════════════════════════════════════════════════════

// Definir el organismo huésped
chassis ecoli {
  organism: "E. coli K-12 MG1655"
  biosafety: BSL1
  growth_rate: 0.4
}

// Un circuito seguro que expresa GFP (proteína verde fluorescente)
safe circuit HelloBiology {
  // Unidad de transcripción: promotor → RBS → gen → terminador
  pConst -> rbs_strong -> GFP -> term_B0015

  // Sistema de seguridad obligatorio
  kill_switch {
    trigger: absence_of("arabinose"),
    mechanism: CcdB,
    delay: 2 hr
  }
}
`,
  },
  {
    id: 'toggle-switch',
    title: 'Toggle Switch',
    description: 'Interruptor genético biestable (Gardner et al. 2000, Nature). Dos represores mutuamente inhibitorios.',
    difficulty: 'Intermediate',
    tags: ['bistable', 'memory', 'repressilator'],
    icon: '🔀',
    code: `// ═══════════════════════════════════════════════════════════
// Toggle Switch — Memoria celular biestable
// Basado en: Gardner, Cantor & Collins. Nature 403, 2000
// ═══════════════════════════════════════════════════════════

chassis ecoli {
  organism: "E. coli K-12 MG1655"
  biosafety: BSL1
  growth_rate: 0.4
}

safe circuit ToggleSwitch {
  // Estado A: pLac reprime TetR, expresa GFP (visible)
  pLac -> rbs_strong -> TetR -> term_B0015
  pLac -> rbs_medium -> GFP -> term_B0015

  // Estado B: pTet reprime LacI, expresa RFP (visible)
  pTet -> rbs_strong -> LacI -> term_B0015
  pTet -> rbs_medium -> RFP -> term_B0015

  // IPTG → libera pLac → produce TetR → reprime pTet → Estado A (verde)
  // aTc  → libera pTet → produce LacI → reprime pLac → Estado B (rojo)

  kill_switch {
    trigger: absence_of("arabinose"),
    mechanism: CcdB,
    delay: 2 hr
  }
}
`,
  },
  {
    id: 'repressilator',
    title: 'Repressilator',
    description: 'Oscilador genético de 3 genes (Elowitz & Leibler 2000, Nature). El Nobel de biología sintética.',
    difficulty: 'Advanced',
    tags: ['oscillator', 'dynamics', 'Nobel'],
    icon: '🔄',
    code: `// ═══════════════════════════════════════════════════════════
// Repressilator — Oscilador genético de 3 nodos
// Basado en: Elowitz & Leibler. Nature 403, 2000
// Período: ~160 min en E. coli
// ═══════════════════════════════════════════════════════════

chassis ecoli {
  organism: "E. coli K-12 MG1655"
  biosafety: BSL1
  growth_rate: 0.4
}

safe circuit Repressilator {
  // Nodo 1: TetR reprime cI
  pTet -> rbs_strong -> LacI -> term_B0015

  // Nodo 2: LacI reprime TetR
  pLac -> rbs_strong -> TetR -> term_B0015

  // Nodo 3: cI reprime LacI (usando pLac como proxy)
  pConst -> rbs_medium -> GFP -> term_B0015

  // La represión mutua circular crea oscilaciones:
  // TetR ⊣ LacI ⊣ cI ⊣ TetR

  kill_switch {
    trigger: absence_of("IPTG"),
    mechanism: CcdB,
    delay: 1 hr
  }
}
`,
  },
  {
    id: 'biosensor-arsenico',
    title: 'Biosensor de Arsénico',
    description: 'Detector de contaminación por arsénico en agua. Aplicación real para países en desarrollo.',
    difficulty: 'Intermediate',
    tags: ['biosensor', 'environment', 'arsenic'],
    icon: '💧',
    code: `// ═══════════════════════════════════════════════════════════
// Biosensor de Arsénico — Detector ambiental
// Límite OMS: 10 ppb As en agua potable
// Basado en: Stocker et al. Environ. Sci. Technol. 2003
// ═══════════════════════════════════════════════════════════

chassis ecoli {
  organism: "E. coli K-12 DH5α"
  biosafety: BSL1
  growth_rate: 0.35
}

safe circuit ArsenicBiosensor {
  // Módulo sensor: ArsR se libera en presencia de As(III)
  pConst -> rbs_strong -> ArsR -> term_B0015

  // Módulo reportero: cuando ArsR se libera, se activa GFP
  arsR_promoter -> rbs_strong -> GFP -> term_B0015

  // Módulo amplificador: señal visual más fuerte
  arsR_promoter -> rbs_medium -> RFP -> term_B0015

  // As(III) > 10 ppb → ArsR se libera → pArs activo → GFP + RFP

  kill_switch {
    trigger: absence_of("arabinose"),
    mechanism: MazF,
    delay: 4 hr
  }
}
`,
  },
  {
    id: 'and-gate',
    title: 'Puerta Lógica AND',
    description: 'Computación celular: solo se activa cuando AMBAS señales están presentes.',
    difficulty: 'Advanced',
    tags: ['logic', 'computing', 'AND gate'],
    icon: '⚡',
    code: `// ═══════════════════════════════════════════════════════════
// Puerta Lógica AND — Computación celular
// GFP solo se expresa con IPTG Y aTc presentes
// Basado en: Wang, Barahona & Buck. Nat. Commun. 2011
// ═══════════════════════════════════════════════════════════

chassis ecoli {
  organism: "E. coli K-12 MG1655"
  biosafety: BSL1
  growth_rate: 0.4
}

safe circuit ANDGate {
  // Input A: IPTG activa pLac → produce T7_half_1
  pLac -> rbs_strong -> LacI -> term_B0015

  // Input B: aTc activa pTet → produce T7_half_2
  pTet -> rbs_strong -> TetR -> term_B0015

  // Output: Solo con ambas mitades → T7 completo → GFP
  pT7 -> rbs_strong -> GFP -> term_B0015

  // Tabla de verdad:
  // IPTG=0, aTc=0 → GFP=OFF
  // IPTG=1, aTc=0 → GFP=OFF
  // IPTG=0, aTc=1 → GFP=OFF
  // IPTG=1, aTc=1 → GFP=ON ✓

  kill_switch {
    trigger: absence_of("glucose"),
    mechanism: CcdB,
    delay: 2 hr
  }
}
`,
  },
  {
    id: 'quorum-sensing',
    title: 'Quorum Sensing',
    description: 'Comunicación célula-célula. Las bacterias "votan" y actúan cuando hay quórum.',
    difficulty: 'Advanced',
    tags: ['communication', 'population', 'AHL'],
    icon: '📡',
    code: `// ═══════════════════════════════════════════════════════════
// Quorum Sensing — Comunicación célula-célula
// Basado en el sistema Lux de Vibrio fischeri
// Ref: Fuqua, Winans & Greenberg. J. Bacteriol. 1994
// ═══════════════════════════════════════════════════════════

chassis ecoli {
  organism: "E. coli Nissle 1917"
  biosafety: BSL1
  growth_rate: 0.38
}

safe circuit QuorumSensor {
  // Módulo emisor: produce AHL constitutivamente
  pConst -> rbs_medium -> LuxR -> term_B0015

  // Módulo receptor: AHL + LuxR activan pLux
  pLux -> rbs_strong -> GFP -> term_B0015

  // Módulo respuesta: cuando hay suficientes células (quórum)
  pLux -> rbs_strong -> RFP -> term_B0015

  // Pocas células → poco AHL → sin fluorescencia
  // Muchas células → mucho AHL → GFP + RFP brillante
  // Umbral típico: ~10^7 cells/mL

  kill_switch {
    trigger: absence_of("thymidine"),
    mechanism: MazF,
    delay: 6 hr
  }
}
`,
  },
];

export function getExampleById(id: string): Example | undefined {
  return EXAMPLES.find(e => e.id === id);
}

export function getExamplesByDifficulty(difficulty: string): Example[] {
  return EXAMPLES.filter(e => e.difficulty === difficulty);
}
