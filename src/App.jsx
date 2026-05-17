import { useState, useEffect } from "react";
import Home          from "./pages/Home";
import Draw          from "./pages/Draw";
import FloatingTimer from "./FloatingTimer";

function useRouter() {
  const get = () => {
    const p = window.location.pathname.replace("/","") || "home";
    return ["home","draw"].includes(p) ? p : "home";
  };
  const [page, setPage] = useState(get);
  const navigate = (to) => {
    window.history.pushState(null,"", to==="home"?"/":`/${to}`);
    setPage(to); window.scrollTo(0,0);
  };
  useEffect(()=>{
    const h=()=>setPage(get());
    window.addEventListener("popstate",h);
    return ()=>window.removeEventListener("popstate",h);
  },[]);
  return { page, navigate };
}

export default function App() {
  const { page, navigate } = useRouter();
  return (
    <>
      {page === "home" && <Home navigate={navigate}/>}
      {page === "draw" && <Draw navigate={navigate}/>}
      <FloatingTimer />
    </>
  );
}
