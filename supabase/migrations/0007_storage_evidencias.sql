-- =============================================================================
-- AAPEX / AACE V2.0 — Migration 0007: Storage de evidências (Masterplan §12, T03)
-- =============================================================================
-- Bucket PRIVADO `evidencias` + políticas de storage.objects. A visualização
-- ocorre por URL assinada de curta duração emitida com o JWT do usuário
-- (src/data/repositories/EvidenceRepository.ts) — logo a RLS de storage.objects
-- é o gate. `service_role` jamais é usado pelo cliente.
--
-- Guardado por existência do schema `storage`: no ambiente Supabase real ele
-- existe e a migration aplica; no harness PGlite (sem storage) vira no-op, mantendo
-- as migrations aplicáveis de ponta a ponta sem Docker. Idempotente (drop/create).
-- =============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'objects') then

    -- Bucket privado (não público).
    insert into storage.buckets (id, name, public)
    values ('evidencias', 'evidencias', false)
    on conflict (id) do nothing;

    -- Leitura: dono do objeto ou administrador (habilita gerar URL assinada).
    execute $p$drop policy if exists evidencias_read on storage.objects$p$;
    execute $p$
      create policy evidencias_read on storage.objects for select to authenticated
      using (bucket_id = 'evidencias' and (owner = auth.uid() or app.is_admin()))
    $p$;

    -- Envio: autenticado envia apenas objetos de sua propriedade no bucket.
    execute $p$drop policy if exists evidencias_insert on storage.objects$p$;
    execute $p$
      create policy evidencias_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'evidencias' and owner = auth.uid())
    $p$;

    -- Remoção: dono ou administrador.
    execute $p$drop policy if exists evidencias_delete on storage.objects$p$;
    execute $p$
      create policy evidencias_delete on storage.objects for delete to authenticated
      using (bucket_id = 'evidencias' and (owner = auth.uid() or app.is_admin()))
    $p$;

  end if;
end $$;
