/**
 * Evidência física e leitura por escopo (D-02, D-03) — migration 0028.
 *
 * D-02: o fluxo oficial criava metadata dizendo 'stored' e o vínculo com a
 * resposta sem que nenhum byte subisse ao bucket. D-03: o Coordenador
 * autorizado, dentro do próprio escopo, recebia "Object not found" ao tentar
 * abrir a evidência, porque a policy do Storage só reconhecia o dono do objeto.
 *
 * O harness agora tem `storage.objects` (ver `testing/supabase_compat.sql`), o
 * que permite exercitar as policies REAIS do bucket — antes elas nunca eram
 * avaliadas em teste, e era por isso que D-03 não tinha onde falhar. O "upload"
 * aqui é o INSERT em `storage.objects` sob RLS, exatamente o caminho que o
 * cliente percorre pela API do Storage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, TestDb } from './testing/harness';
import { seedScenario, anexarEvidencia, ID } from './testing/fixtures';

const ENTRADA_VALIDA = JSON.stringify({
  name: 'comprovacao.jpg', mimeType: 'image/jpeg', type: 'photo', sizeBytes: 2048,
});

interface Reserva { reservationId: string; bucket: string; path: string; name: string }

/**
 * Rascunho NOVO e isolado. `start_evaluation` reaproveita a avaliação aberta do
 * mesmo período, então sem esta limpeza os testes herdariam as evidências uns
 * dos outros e as contagens não provariam nada.
 */
async function rascunhoRespondido(db: TestDb): Promise<string> {
  await db.exec(`
    delete from public.evidence_upload_reservations;
    delete from public.evaluation_answer_evidence;
    delete from public.evidence_files;
    delete from storage.objects where bucket_id = 'evidencias';
    delete from public.validations;
    delete from public.official_snapshots;
    delete from public.evaluations where operation_id = '${ID.opB}';
  `);
  const draft = (await db.asUser(ID.uGcB, (tx) =>
    tx.query<{ ev: { id: string } }>(`select public.start_evaluation($1,$2,$3) as ev`,
      [ID.opB, 'weekly', ID.uGcB])))[0].ev;
  await db.asUser(ID.uGcB, (tx) =>
    tx.query(`select public.save_evaluation_answer($1,$2,$3::jsonb)`,
      [draft.id, 'I01', JSON.stringify({ status: 'green' })]));
  return draft.id;
}

async function reservar(db: TestDb, evalId: string, entrada = ENTRADA_VALIDA): Promise<Reserva> {
  return (await db.asUser(ID.uGcB, (tx) =>
    tx.query<{ r: Reserva }>(`select public.reserve_evidence_upload($1,$2,$3::jsonb) as r`,
      [evalId, 'I01', entrada])))[0].r;
}

/** O "upload": INSERT no bucket sob RLS, com o JWT do próprio usuário. */
async function subirObjeto(db: TestDb, userId: string, bucket: string, path: string) {
  return db.asUser(userId, (tx) =>
    tx.query(`insert into storage.objects (bucket_id, name, owner) values ($1,$2,auth.uid())`,
      [bucket, path]));
}

async function contarEvidencias(db: TestDb, evalId: string) {
  return (await db.query<{ meta: number; vinculo: number; objeto: number; reserva: number }>(
    `select (select count(*) from public.evidence_files where source_object_id = $1)::int as meta,
            (select count(*) from public.evaluation_answer_evidence l
               join public.evaluation_answers ea on ea.id = l.answer_id
              where ea.evaluation_id = $1)::int as vinculo,
            (select count(*) from storage.objects where bucket_id = 'evidencias')::int as objeto,
            (select count(*) from public.evidence_upload_reservations where evaluation_id = $1)::int as reserva`,
    [evalId],
  ))[0];
}

describe('D-02 — a evidência chega fisicamente ao Storage', () => {
  let db: TestDb;
  beforeAll(async () => { db = await createTestDb(); await seedScenario(db); }, 30_000);
  afterAll(async () => { await db.close(); });

  it('fluxo completo: objeto no bucket, metadata e vínculo — e o caminho é o mesmo nos três', async () => {
    const evalId = await rascunhoRespondido(db);
    const anexo = await anexarEvidencia(db, { userId: ID.uGcB, evaluationId: evalId, themeId: 'I01' });

    const objeto = await db.query<{ name: string; owner: string }>(
      `select name, owner::text from storage.objects where bucket_id='evidencias' and name = $1`,
      [anexo.path]);
    expect(objeto).toHaveLength(1);
    expect(objeto[0].owner).toBe(ID.uGcB);

    const meta = await db.query<{ path: string; status: string; author: string; size: number; mime: string }>(
      `select path, status::text as status, author_user_id::text as author, size_bytes as size, mime_type as mime
         from public.evidence_files where id = $1`, [anexo.evidenceId]);
    expect(meta[0].path).toBe(anexo.path);   // metadata aponta para o objeto real
    expect(meta[0].status).toBe('stored');
    expect(meta[0].author).toBe(ID.uGcB);
    expect(meta[0].mime).toBe('image/jpeg');
    expect(meta[0].size).toBe(1024);

    const vinculo = await db.query<{ n: number }>(
      `select count(*)::int n from public.evaluation_answer_evidence where evidence_id = $1`,
      [anexo.evidenceId]);
    expect(vinculo[0].n).toBe(1);

    // A reserva foi consumida: não sobra estado intermediário.
    const contagem = await contarEvidencias(db, evalId);
    expect(contagem.reserva).toBe(0);

    // E a evidência aparece na projeção que a tela consome.
    const ui = await db.asUser(ID.uGcB, (tx) =>
      tx.query<{ id: string; name: string; status: string }>(
        `select "id","name","status" from public.ui_evidences where "id" = $1`, [anexo.evidenceId]));
    expect(ui[0].name).toBe('comprovacao.jpg');
    expect(ui[0].status).toBe('stored');
  });

  it('sem o arquivo no bucket, a confirmação falha e NÃO cria metadata nem vínculo', async () => {
    const evalId = await rascunhoRespondido(db);
    const antes = await contarEvidencias(db, evalId);
    const reserva = await reservar(db, evalId);

    // Salta o upload de propósito — é o caso "o envio do binário falhou".
    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.confirm_evidence_upload($1)`, [reserva.reservationId]));
    expect(erro.message).toMatch(/nao chegou ao armazenamento/);

    const depois = await contarEvidencias(db, evalId);
    expect(depois.meta).toBe(antes.meta);
    expect(depois.vinculo).toBe(antes.vinculo);
  });

  it('descartar a reserva não deixa resíduo, e descartar duas vezes não é erro', async () => {
    const evalId = await rascunhoRespondido(db);
    const reserva = await reservar(db, evalId);
    expect((await contarEvidencias(db, evalId)).reserva).toBe(1);

    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.discard_evidence_reservation($1)`, [reserva.reservationId]));
    expect((await contarEvidencias(db, evalId)).reserva).toBe(0);

    // Idempotente: a compensação pode rodar de novo num retry sem quebrar.
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.discard_evidence_reservation($1)`, [reserva.reservationId]));
  });

  it('a reserva é de uso único: confirmar duas vezes não duplica a evidência', async () => {
    const evalId = await rascunhoRespondido(db);
    const reserva = await reservar(db, evalId);
    await subirObjeto(db, ID.uGcB, reserva.bucket, reserva.path);
    await db.asUser(ID.uGcB, (tx) =>
      tx.query(`select public.confirm_evidence_upload($1)`, [reserva.reservationId]));

    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`select public.confirm_evidence_upload($1)`, [reserva.reservationId]));
    expect(erro.message).toMatch(/reserva inexistente ou ja consumida/);

    const meta = await db.query<{ n: number }>(
      `select count(*)::int n from public.evidence_files where source_object_id = $1`, [evalId]);
    expect(meta[0].n).toBe(1);
  });

  it('formato e tamanho inválidos são recusados na reserva, antes de qualquer upload', async () => {
    const evalId = await rascunhoRespondido(db);

    const tipo = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `select public.reserve_evidence_upload($1,$2,$3::jsonb)`,
      [evalId, 'I01', JSON.stringify({ name: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 })]));
    expect(tipo.message).toMatch(/imagem ou PDF/);

    const grande = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `select public.reserve_evidence_upload($1,$2,$3::jsonb)`,
      [evalId, 'I01', JSON.stringify({ name: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 20 * 1024 * 1024 })]));
    expect(grande.message).toMatch(/ate 15 MB/);

    const vazio = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `select public.reserve_evidence_upload($1,$2,$3::jsonb)`,
      [evalId, 'I01', JSON.stringify({ name: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 0 })]));
    expect(vazio.message).toMatch(/tamanho de arquivo invalido/);

    expect((await contarEvidencias(db, evalId)).reserva).toBe(0);
  });

  it('o caminho é decidido pelo servidor: nome de arquivo com barra não vira pasta', async () => {
    const evalId = await rascunhoRespondido(db);
    const reserva = await reservar(db, evalId, JSON.stringify({
      name: '../../etc/passwd', mimeType: 'application/pdf', sizeBytes: 10,
    }));
    // Um único separador: o do tema. O nome perdeu barras e pontos de subida.
    expect(reserva.path.split('/')).toHaveLength(2);
    expect(reserva.path.startsWith('I01/')).toBe(true);
    expect(reserva.path).not.toContain('..');
  });

  it('caminho não reservado é recusado pelo bucket, mesmo para usuário autenticado', async () => {
    const erro = await db.asUser(ID.uGcB, (tx) =>
      tx.expectError(`insert into storage.objects (bucket_id, name, owner) values ($1,$2,auth.uid())`,
        ['evidencias', 'I01/caminho-inventado-pelo-cliente.jpg']));
    expect(erro).toBeInstanceOf(Error);
  });

  it('a reserva de um usuário não autoriza o upload de outro', async () => {
    const evalId = await rascunhoRespondido(db);
    const reserva = await reservar(db, evalId);
    // uGcA é autenticado, mas a reserva é de uGcB.
    const erro = await db.asUser(ID.uGcA, (tx) =>
      tx.expectError(`insert into storage.objects (bucket_id, name, owner) values ($1,$2,auth.uid())`,
        [reserva.bucket, reserva.path]));
    expect(erro).toBeInstanceOf(Error);
  });

  it('metadata e vínculo não aceitam mais escrita direta do cliente', async () => {
    const evalId = await rascunhoRespondido(db);
    // Era assim que dava para satisfazer o portão de evidência sem arquivo.
    const forjaMeta = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `insert into public.evidence_files (bucket, path, mime_type, size_bytes, author_user_id, source_object_id, status)
       values ('evidencias','I01/forjado.jpg','image/jpeg',1,auth.uid(),$1,'stored')`, [evalId]));
    expect(forjaMeta).toBeInstanceOf(Error);
  });

  it('evidência só em rascunho ou devolvida', async () => {
    const evalId = await rascunhoRespondido(db);
    await anexarEvidencia(db, { userId: ID.uGcB, evaluationId: evalId, themeId: 'I01' });
    await db.asUser(ID.uGcB, (tx) => tx.query(`select public.submit_evaluation($1)`, [evalId]));

    const erro = await db.asUser(ID.uGcB, (tx) => tx.expectError(
      `select public.reserve_evidence_upload($1,$2,$3::jsonb)`, [evalId, 'I01', ENTRADA_VALIDA]));
    expect(erro.message).toMatch(/rascunho\/devolvida/);
  });
});

describe('D-03 — quem pode abrir a evidência no bucket', () => {
  let db: TestDb;
  let caminho: string;
  let evidenceId: string;

  beforeAll(async () => {
    db = await createTestDb();
    await seedScenario(db);
    const evalId = await rascunhoRespondido(db);
    const anexo = await anexarEvidencia(db, { userId: ID.uGcB, evaluationId: evalId, themeId: 'I01' });
    caminho = anexo.path;
    evidenceId = anexo.evidenceId;
  }, 30_000);
  afterAll(async () => { await db.close(); });

  /** O que a API do Storage faz para emitir URL assinada: um SELECT sob RLS. */
  const podeLer = (userId: string) => db.asUser(userId, (tx) =>
    tx.query<{ n: number }>(
      `select count(*)::int n from storage.objects where bucket_id='evidencias' and name = $1`,
      [caminho]));

  it('o autor lê a própria evidência', async () => {
    expect((await podeLer(ID.uGcB))[0].n).toBe(1);
  });

  it('o Coordenador do escopo lê — era exatamente isto que falhava', async () => {
    // uCoord2 coordena a coordenadoria de opB. Antes da 0028 a policy olhava só
    // `owner = auth.uid()` e ele recebia "Object not found".
    expect((await podeLer(ID.uCoord2))[0].n).toBe(1);
  });

  it('a Gerência Regional da região lê', async () => {
    expect((await podeLer(ID.uReg))[0].n).toBe(1);
  });

  it('o Administrador lê', async () => {
    expect((await podeLer(ID.uAdmin))[0].n).toBe(1);
  });

  it('Coordenador de OUTRA coordenadoria não lê', async () => {
    expect((await podeLer(ID.uCoord1))[0].n).toBe(0);
  });

  it('Gerente de Canal de outro parceiro não lê', async () => {
    expect((await podeLer(ID.uGcA))[0].n).toBe(0);
  });

  it('usuário autenticado sem escopo algum não lê', async () => {
    expect((await podeLer(ID.uNoScope))[0].n).toBe(0);
  });

  it('anônimo não lê', async () => {
    const r = await db.asAnon((tx) => tx.query<{ n: number }>(
      `select count(*)::int n from storage.objects where bucket_id='evidencias' and name = $1`,
      [caminho]));
    expect(r[0].n).toBe(0);
  });

  it('objeto SEM metadata correspondente não é autorizado a ninguém', async () => {
    // Objeto plantado direto no bucket (como se tivesse sobrado de uma limpeza
    // incompleta): sem metadata, não há a quem vincular escopo.
    await db.exec(`insert into storage.objects (bucket_id, name, owner)
                   values ('evidencias','I01/orfao.jpg','${ID.uGcB}')`);
    for (const u of [ID.uGcB, ID.uCoord2, ID.uReg]) {
      const r = await db.asUser(u, (tx) => tx.query<{ n: number }>(
        `select count(*)::int n from storage.objects where bucket_id='evidencias' and name='I01/orfao.jpg'`));
      expect(r[0].n, `usuario ${u}`).toBe(0);
    }
  });

  it('caminho adivinhado não é autorizado nem para quem tem escopo', async () => {
    const r = await db.asUser(ID.uCoord2, (tx) => tx.query<{ n: number }>(
      `select count(*)::int n from storage.objects
        where bucket_id='evidencias' and name = $1`, [`${caminho}.bak`]));
    expect(r[0].n).toBe(0);
  });

  it('evidence_path concorda com a policy: mesmo escopo, mesma resposta', async () => {
    const doCoord = await db.asUser(ID.uCoord2, (tx) =>
      tx.query<{ p: string }>(`select public.evidence_path($1) as p`, [evidenceId]));
    expect(doCoord[0].p).toBe(caminho);

    await db.asUser(ID.uCoord1, (tx) =>
      tx.expectError(`select public.evidence_path($1)`, [evidenceId]));
  });
});
