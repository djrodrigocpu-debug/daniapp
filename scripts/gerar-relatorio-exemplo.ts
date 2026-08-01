/**
 * Gera um Relatório Oficial de Auditoria de EXEMPLO a partir da fixture
 * sintética, para inspeção visual do documento sem depender de banco, sessão
 * ou navegador.
 *
 *   npx vite-node scripts/gerar-relatorio-exemplo.ts -- <destino.pdf>
 *
 * Dados inteiramente fictícios (§23). Nunca aponte este script para dado real:
 * ele existe para conferir LAYOUT — margens, paginação, quebra de texto — e não
 * para exportar auditoria de ninguém.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOfficialAuditReportModel } from '../src/domain/report/officialAuditReport';
import { reportInputFixture } from '../src/domain/report/officialAuditReportFixture';
import { renderOfficialAuditReportPdf } from '../src/domain/report/pdf/renderOfficialAuditReport';

const destino = resolve(process.argv[2] ?? 'relatorio-exemplo.pdf');

const modelo = buildOfficialAuditReportModel(reportInputFixture(), new Date().toISOString());
if (!modelo.ok) {
  console.error('falha ao montar o modelo:', modelo.error.message);
  process.exit(1);
}

const bytes = renderOfficialAuditReportPdf(modelo.value);
writeFileSync(destino, bytes);

console.log(`arquivo:     ${destino}`);
console.log(`nome:        ${modelo.value.fileName}`);
console.log(`bytes:       ${bytes.byteLength}`);
console.log(`integridade: ${modelo.value.integrity.displayCode}`);
