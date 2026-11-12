// frontend/src/App.tsx - rotas públicas (entrar, cadastro, confirmação) e rotas atrás do login
import { Box, Typography } from "@mui/material";
import { Route, Routes } from "react-router-dom";
import RotaProtegida from "./auth/RotaProtegida";
import LayoutApp from "./layout/LayoutApp";
import LayoutPublico from "./layout/LayoutPublico";
import CadastrarCardapio from "./paginas/admin/CadastrarCardapio";
import Cadastro from "./paginas/publico/Cadastro";
import ConfirmarEmail from "./paginas/publico/ConfirmarEmail";
import Entrar from "./paginas/publico/Entrar";
import Cardapio from "./paginas/usuario/Cardapio";
import Historico from "./paginas/usuario/Historico";
import Perfil from "./paginas/usuario/Perfil";
import StatusCadastro from "./paginas/usuario/StatusCadastro";

const Pagina = ({ titulo }: { titulo: string }) => (
  <Box sx={{ p: 2 }}><Typography variant="h5">{titulo}</Typography></Box>
);

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
        {/* Só com o cadastro ativo; o menu por perfil é da HU-03. */}
        <Route element={<LayoutApp />}>
          <Route path="/" element={<Pagina titulo="Início" />} />
          <Route path="/recarga" element={<Pagina titulo="Recarregar" />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/cardapio" element={<Cardapio />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/admin/cardapio" element={<CadastrarCardapio />} />
        </Route>
      </Route>
    </Routes>
  );
}
