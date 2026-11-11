import { Box, BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import PersonIcon from "@mui/icons-material/Person";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/contexto";

// Menu do perfil Usuário. O menu por perfil (Operador, Admin, Mestre) é da HU-03.
const abas = [
  { to: "/", rotulo: "Início", icone: <HomeIcon /> },
  { to: "/recarga", rotulo: "Recarga", icone: <CreditCardIcon /> },
  { to: "/historico", rotulo: "Histórico", icone: <ReceiptLongIcon /> },
  { to: "/cardapio", rotulo: "Cardápio", icone: <RestaurantIcon /> },
  { to: "/perfil", rotulo: "Perfil", icone: <PersonIcon /> },
];

/** Moldura do app para quem está com o cadastro ativo: conteúdo e navegação inferior. */
export default function LayoutApp() {
  const { estado } = useAuth();
  const { pathname } = useLocation();

  // Conta ainda não aprovada (ou rejeitada) só vê a tela de status do cadastro.
  if (estado.tipo === "autenticado" && estado.usuario.status !== "ATIVO") {
    return <Navigate to="/status-cadastro" replace />;
  }

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", pb: 9 }}>
      <Outlet />
      <Paper
        component="nav"
        aria-label="Navegação principal"
        sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar, bgcolor: "background.paper" }}
        elevation={3}
      >
        <BottomNavigation value={pathname} sx={{ maxWidth: 480, mx: "auto" }}>
          {abas.map((a) => (
            <BottomNavigationAction key={a.to} component={Link} to={a.to} value={a.to} label={a.rotulo} icon={a.icone} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
