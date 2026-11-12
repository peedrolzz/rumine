import { useState } from "react";
import { Alert, Box, BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import PersonIcon from "@mui/icons-material/Person";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import HistoryIcon from "@mui/icons-material/History";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/contexto";
import type { Perfil } from "../auth/perfis";

type Aba = { to: string; rotulo: string; icone: React.ReactNode };
const perfilAba: Aba = { to: "/perfil", rotulo: "Perfil", icone: <PersonIcon /> };

// Cada perfil vê só o que usa (HU-03). O menu apenas esconde; o backend é quem barra as rotas.
const ABAS_POR_PERFIL: Record<Perfil, Aba[]> = {
  USUARIO: [
    { to: "/", rotulo: "Início", icone: <HomeIcon /> },
    { to: "/recarga", rotulo: "Recarga", icone: <CreditCardIcon /> },
    { to: "/historico", rotulo: "Histórico", icone: <ReceiptLongIcon /> },
    { to: "/cardapio", rotulo: "Cardápio", icone: <RestaurantIcon /> },
    perfilAba,
  ],
  OPERADOR: [{ to: "/operador/leitura", rotulo: "Ler QR", icone: <QrCodeScannerIcon /> }, perfilAba],
  ADMIN: [
    { to: "/admin/cardapio", rotulo: "Cardápio", icone: <RestaurantIcon /> },
    { to: "/admin/cadastros", rotulo: "Cadastros", icone: <HowToRegIcon /> },
    { to: "/admin/historico", rotulo: "Histórico", icone: <HistoryIcon /> },
    perfilAba,
  ],
  MESTRE: [
    { to: "/mestre/contas", rotulo: "Contas", icone: <GroupAddIcon /> },
    { to: "/mestre/logs", rotulo: "Logs", icone: <ListAltIcon /> },
    perfilAba,
  ],
};

/** Moldura do app para quem está com o cadastro ativo: conteúdo e navegação inferior do perfil. */
export default function LayoutApp() {
  const { estado } = useAuth();
  const local = useLocation();
  const [avisoFechado, setAvisoFechado] = useState<unknown>(null);

  // Conta ainda não aprovada (ou rejeitada) só vê a tela de status do cadastro.
  if (estado.tipo === "autenticado" && estado.usuario.status !== "ATIVO") {
    return <Navigate to="/status-cadastro" replace />;
  }
  if (estado.tipo !== "autenticado") return null; // a guarda de rota já trata esses casos

  const abas = ABAS_POR_PERFIL[estado.usuario.perfil];
  // Aviso de "sem acesso" que veio do redirecionamento; some ao fechar (por navegação, não por tela).
  const aviso = (local.state as { aviso?: string } | null)?.aviso;
  const mostrarAviso = aviso && avisoFechado !== local.key;

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", pb: 9 }}>
      {mostrarAviso && (
        <Alert severity="warning" onClose={() => setAvisoFechado(local.key)} sx={{ m: 2, mb: 0 }}>
          {aviso}
        </Alert>
      )}
      <Outlet />
      <Paper
        component="nav"
        aria-label="Navegação principal"
        sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar, bgcolor: "background.paper" }}
        elevation={3}
      >
        <BottomNavigation value={local.pathname} sx={{ maxWidth: 480, mx: "auto" }}>
          {abas.map((a) => (
            <BottomNavigationAction key={a.to} component={Link} to={a.to} value={a.to} label={a.rotulo} icon={a.icone} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
