/** Separa usuário e servidor de um JID, descartando o sufixo de dispositivo (":12"). */
function partes(jid) {
  if (typeof jid !== 'string' || !jid.includes('@')) return null;
  const [usuario, servidor] = jid.split('@');
  return { usuario: usuario.split(':')[0], servidor };
}

/**
 * Só a conversa privada com o dono é atendida. Grupos, status e qualquer
 * outro número são rejeitados (e ignorados sem resposta pelo chamador).
 * @param {string} jid
 * @param {{jid?: string, lid?: string}} dono
 */
export function ehDoDono(jid, dono) {
  const r = partes(jid);
  if (!r || !['s.whatsapp.net', 'lid'].includes(r.servidor)) return false;
  return [dono.jid, dono.lid].some((alvo) => {
    const a = partes(alvo);
    return !!a && a.servidor === r.servidor && a.usuario === r.usuario;
  });
}
