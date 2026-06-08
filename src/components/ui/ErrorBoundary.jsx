// Error boundary simples — captura crash em descendentes e mostra detalhe.
// Usado durante diagnóstico de bugs em produção. Em vez de tela branca,
// mostra a mensagem + stack trace pro user copiar.

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null, stack: null };
  }
  static getDerivedStateFromError(erro) {
    return { erro };
  }
  componentDidCatch(erro, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', erro, info);
    this.setState({ stack: info?.componentStack || null });
  }
  render() {
    if (this.state.erro) {
      return (
        <div className="p-6 bg-red-50 border-2 border-red-300 rounded-xl m-4">
          <h2 className="text-red-900 font-bold text-lg mb-2">⚠ Erro ao renderizar página</h2>
          <p className="text-red-800 font-mono text-sm bg-white border border-red-200 rounded p-3 mb-3 whitespace-pre-wrap">
            {String(this.state.erro?.message || this.state.erro)}
          </p>
          {this.state.stack && (
            <details className="text-xs text-red-700">
              <summary className="cursor-pointer font-semibold">Stack trace</summary>
              <pre className="bg-white border border-red-200 rounded p-3 mt-2 overflow-auto whitespace-pre-wrap">
                {this.state.stack}
              </pre>
            </details>
          )}
          <button onClick={() => this.setState({ erro: null, stack: null })}
            className="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold">
            Tentar de novo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
