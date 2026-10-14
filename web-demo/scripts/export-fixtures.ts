import { mkdirSync, writeFileSync } from 'fs';
import { compile, exportSBOL } from '../src/lib/compiler';
import { generateSbml } from '../src/lib/artifacts';

const outDir = process.argv[2] || '/tmp/synbio-web-exports';
mkdirSync(outDir, { recursive: true });

const sources: Record<string, string> = {
  inverter: `circuit inverter {
    promoter: J23101
    rbs: B0034
    gene tetR { product: TetR }
    terminator: B0015
  }`,
  gfp_cassette_demo: `circuit gfp_cassette_demo {
    pLac -> B0034 -> GFP -> B0015
  }`,
};

for (const [name, source] of Object.entries(sources)) {
  const result = compile(source);
  const circuit = result.circuits[0];
  if (!circuit) {
    throw new Error(`${name} did not parse: ${JSON.stringify(result.diagnostics)}`);
  }
  writeFileSync(`${outDir}/${name}.sbol`, exportSBOL(circuit));
  writeFileSync(`${outDir}/${name}.sbml`, generateSbml(circuit));
}

console.log(`wrote SBOL and SBML fixtures to ${outDir}`);
