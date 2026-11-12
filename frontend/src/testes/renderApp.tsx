import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { AuthProvider } from "../auth/AuthProvider";

/** Renderiza o app inteiro (rotas, sessão e telas) em uma rota, como o navegador faria. */
export function renderApp(rota = "/", opcoes: { estrito?: boolean } = {}) {
  const arvore = (
    <MemoryRouter initialEntries={[rota]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
  return render(opcoes.estrito ? <StrictMode>{arvore}</StrictMode> : arvore);
}
