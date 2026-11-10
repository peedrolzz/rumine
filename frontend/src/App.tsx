// frontend/src/App.tsx - layout com navegação inferior (menu do perfil Usuário) e rotas vazias
import { Box, BottomNavigation, BottomNavigationAction, Paper, Typography } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import CadastrarCardapio from "./paginas/admin/CadastrarCardapio";

const Pagina = ({ titulo }: { titulo: string }) => (
  <Box sx={{ p: 2 }}><Typography variant="h5">{titulo}</Typography></Box>
);

const abas = [
  { to: "/", rotulo: "Início", icone: <HomeIcon /> },
  { to: "/recarga", rotulo: "Recarga", icone: <CreditCardIcon /> },
  { to: "/historico", rotulo: "Histórico", icone: <ReceiptLongIcon /> },
  { to: "/cardapio", rotulo: "Cardápio", icone: <RestaurantIcon /> },
];

export default function App() {
  const { pathname } = useLocation();
  return (
    <Box sx={{ maxWidth: 480, mx: "auto", pb: 9 }}>
      <Routes>
        <Route path="/" element={<Pagina titulo="Início" />} />
        <Route path="/recarga" element={<Pagina titulo="Recarregar" />} />
        <Route path="/historico" element={<Pagina titulo="Histórico" />} />
        <Route path="/cardapio" element={<Pagina titulo="Cardápio" />} />
        <Route path="/admin/cardapio" element={<CadastrarCardapio />} />
      </Routes>
      <Paper
        sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar, bgcolor: "background.paper" }}
        elevation={3}
      >
        <BottomNavigation value={pathname} sx={{ maxWidth: 480, mx: "auto" }}>
          {abas.map((a) => (
            <BottomNavigationAction key={a.to} component={Link} to={a.to}
              value={a.to} label={a.rotulo} icon={a.icone} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
