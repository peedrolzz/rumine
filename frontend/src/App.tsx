// frontend/src/App.tsx - rotas públicas (entrar, cadastro, confirmação) e rotas atrás do login
import { Route, Routes } from "react-router-dom";
import RotaPorPerfil, { InicioPorPerfil } from "./auth/RotaPorPerfil";
import RotaProtegida from "./auth/RotaProtegida";
import EmBreve from "./componentes/EmBreve";
import LayoutApp from "./layout/LayoutApp";
import LayoutPublico from "./layout/LayoutPublico";
import CadastrarCardapio from "./paginas/admin/CadastrarCardapio";
import Cadastros from "./paginas/admin/Cadastros";
import Logs from "./paginas/mestre/Logs";
import NovaConta from "./paginas/mestre/NovaConta";
import Cadastro from "./paginas/publico/Cadastro";
import ConfirmarEmail from "./paginas/publico/ConfirmarEmail";
import Entrar from "./paginas/publico/Entrar";
import Cardapio from "./paginas/usuario/Cardapio";
import Inicio from "./paginas/usuario/Inicio";
import QrCode from "./paginas/usuario/QrCode";
import Recarga from "./paginas/usuario/Recarga";
import Historico from "./paginas/usuario/Historico";
import Perfil from "./paginas/usuario/Perfil";
import StatusCadastro from "./paginas/usuario/StatusCadastro";

export default function App() {
  return (
    <Routes>
      {/* Telas de entrada: quem já está logado é levado para o app. */}
      <Route element={<LayoutPublico redirecionarSeLogado />}>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/cadastro" element={<Cadastro />} />
      </Route>
      {/* O link do e-mail abre mesmo com outra conta logada neste aparelho. */}
      <Route element={<LayoutPublico />}>
        <Route path="/confirmar-email" element={<ConfirmarEmail />} />
      </Route>

      {/* Atrás do login. */}
      <Route element={<RotaProtegida />}>
        <Route path="/status-cadastro" element={<StatusCadastro />} />
        {/* Só com o cadastro ativo. Cada perfil abre só as telas dele (o backend também barra). */}
        <Route element={<LayoutApp />}>
          <Route path="/" element={<InicioPorPerfil inicioUsuario={<Inicio />} />} />
          <Route path="/perfil" element={<Perfil />} />

          <Route element={<RotaPorPerfil perfis={["USUARIO"]} />}>
            <Route path="/qr" element={<QrCode />} />
            <Route path="/recarga" element={<Recarga />} />
            <Route path="/historico" element={<Historico />} />
            <Route path="/cardapio" element={<Cardapio />} />
          </Route>

          <Route element={<RotaPorPerfil perfis={["OPERADOR"]} />}>
            <Route
              path="/operador/leitura"
              element={<EmBreve titulo="Ler QR Code" descricao="A leitura do QR Code do aluno chega com a HU-07." />}
            />
          </Route>

          <Route element={<RotaPorPerfil perfis={["ADMIN"]} />}>
            <Route path="/admin/cardapio" element={<CadastrarCardapio />} />
            <Route path="/admin/cadastros" element={<Cadastros />} />
            <Route
              path="/admin/historico"
              element={<EmBreve titulo="Histórico geral" descricao="O histórico geral chega com a HU-10." />}
            />
          </Route>

          <Route element={<RotaPorPerfil perfis={["MESTRE"]} />}>
            <Route path="/mestre/contas" element={<NovaConta />} />
            <Route path="/mestre/logs" element={<Logs />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
