import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Loader2, Search, Users, Mail, Building2,
  Check, ShieldCheck, AlertCircle, Clock,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import Toast from '../../../components/ui/Toast';
import Modal from '../../../components/ui/Modal';
import PainelAcessosUsuario from '../../../components/usuarios/PainelAcessosUsuario';
import * as perfisService from '../../../services/perfisPermissaoService';
import ModalExpediente from '../../../components/usuarios/ModalExpediente';
import { useClienteSession } from '../../../hooks/useAuth';
import * as usuariosService from '../../../services/usuariosSistemaService';

export default function ClienteUsuarios() {
  const session = useClienteSession();
  const chaveApi = session?.chaveApi;
  const usuarioLogado = session?.usuario;
  const empresasDisponiveis = session?.clientesRede || [];
  const podeGerenciar = !!usuarioLogado?.permissoes?.includes('gerenciar_usuarios');

  const [usuarios, setUsuarios] = useState([]);
  const [expediente, setExpediente] = useState(null); // usuário com o modal de horário aberto
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });
  const [confirm, setConfirm] = useState({ open: false });
  const [toast, setToast] = useState({ show: false, type: 'success', message: '' });
  const [perfis, setPerfis] = useState([]); // modelos de permissão de cliente (migration 235)
  // Migration 234: o gerente só concede o que tem e, se restrito, só as empresas dele.
  const minhasPerms = useMemo(() => new Set(usuarioLogado?.permissoes || []), [usuarioLogado]);
  const restrito = Array.isArray(usuarioLogado?.empresas_permitidas) && usuarioLogado.empresas_permitidas.length > 0;

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2800);
  };

  const carregar = useCallback(async () => {
    if (!chaveApi?.id) return;
    try {
      setLoading(true);
      const data = await usuariosService.listarUsuariosDaRede(chaveApi.id);
      setUsuarios(data);
    } catch (err) { showToast('error', err.message); }
    finally { setLoading(false); }
  }, [chaveApi?.id]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { perfisService.listarPerfis('cliente').then(setPerfis).catch(() => setPerfis([])); }, []);

  // Painel de acessos: erro sobe para o painel (fica aberto com a mensagem).
  const salvar = async (patch) => {
    const u = modal.data;
    // Força tipo=cliente e a rede do gerente (o banco ignora rede vinda do cliente)
    const payload = { ...patch, tipo: 'cliente', chave_api_id: chaveApi.id };
    try {
      if (u?.id) await usuariosService.atualizarUsuario(u.id, payload);
      else await usuariosService.criarUsuario(payload);
    } catch (err) {
      throw new Error(/duplicate|unique/i.test(err.message || '') ? 'Já existe um usuário com esse e-mail.' : err.message);
    }
    showToast('success', u?.id ? `Acessos de ${u.nome} atualizados` : 'Usuário criado');
    setModal({ open: false, data: null });
    await carregar();
  };

  const excluir = async (id) => {
    try {
      await usuariosService.excluirUsuario(id);
      showToast('success', 'Usuário excluido');
      setConfirm({ open: false });
      await carregar();
    } catch (err) { showToast('error', err.message); }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(u =>
      u.nome.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }, [usuarios, busca]);

  if (!podeGerenciar) {
    return (
      <div>
        <PageHeader title="Usuários da Rede" description="Gerenciamento de acessos dos usuários da sua rede" />
        <div className="bg-white rounded-2xl border border-gray-200/60 px-6 py-16 text-center shadow-sm">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Acesso restrito</p>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Você não tem permissão para gerenciar usuários. Contate o administrador da rede.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Toast {...toast} onClose={() => setToast(t => ({ ...t, show: false }))} />

      <PageHeader title="Usuários da Rede"
        description={`Gerencie os acessos dos usuários da rede ${chaveApi?.nome || ''}`}>
        <button onClick={() => setModal({ open: true, data: null })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Novo Usuário
        </button>
      </PageHeader>

      <div className="bg-white rounded-xl border border-gray-200/60 p-3 mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="w-full h-9 rounded-lg border border-gray-200 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200/60 px-6 py-16 text-center">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600">
            {usuarios.length === 0 ? 'Nenhum usuário cadastrado na sua rede ainda.' : 'Nenhum usuário corresponde a busca.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3 text-center">Empresas</th>
                  <th className="px-4 py-3 text-center">Permissões</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtrados.map(u => {
                  const qtdEmp = Array.isArray(u.empresas_permitidas) && u.empresas_permitidas.length > 0
                    ? u.empresas_permitidas.length
                    : empresasDisponiveis.length;
                  const acessoTotal = !u.empresas_permitidas || u.empresas_permitidas.length === 0;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/60 group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0 bg-gradient-to-br from-emerald-500 to-teal-600">
                            {u.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{u.nome}</p>
                            <p className="text-[11px] text-gray-500 flex items-center gap-1">
                              <Mail className="h-3 w-3 text-gray-400" />{u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${
                          acessoTotal ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          <Building2 className="h-3 w-3" /> {acessoTotal ? `Todas (${qtdEmp})` : `${qtdEmp} empresa${qtdEmp === 1 ? '' : 's'}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200">
                          <ShieldCheck className="h-3 w-3" /> {(u.permissoes || []).length}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.status === 'ativo' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="h-3 w-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
                            Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {u.id === usuarioLogado?.id ? (
                            <span className="text-[10px] text-gray-400" title="Suas permissões são definidas por outro gestor da rede ou pela CCI">você</span>
                          ) : (<>
                          <button onClick={() => setExpediente(u)} title="Horário de trabalho (avisos de tarefa)"
                            className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setModal({ open: true, data: u })} title="Editar"
                            className="rounded p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirm({ open: true, nome: u.nome, onConfirm: () => excluir(u.id) })}
                            title="Excluir"
                            className="rounded p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          </>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expediente && <ModalExpediente usuario={expediente} onClose={() => setExpediente(null)}
        onSalvo={(exp) => { setUsuarios(l => l.map(x => (x.id === expediente.id ? { ...x, expediente: exp } : x))); showToast('success', 'Horário de trabalho salvo.'); }} />}
      <PainelAcessosUsuario open={modal.open} usuario={modal.data} tipoAlvo="cliente" tipoCliente="webposto"
        comDados catalogo={usuariosService.PERMISSOES_CLIENTE} concedivel={minhasPerms} perfis={perfis}
        empresas={empresasDisponiveis} soSelecionadas={restrito}
        contexto={chaveApi?.nome || ''}
        onClose={() => setModal({ open: false, data: null })} onSave={salvar} />

      <Modal open={confirm.open} onClose={() => setConfirm({ open: false })} title="Excluir usuário" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Excluir o usuário <strong>{confirm.nome}</strong>? O acesso sera removido imediatamente.</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setConfirm({ open: false })} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button onClick={confirm.onConfirm} className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
