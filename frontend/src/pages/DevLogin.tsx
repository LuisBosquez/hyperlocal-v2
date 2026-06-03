// DEV ONLY — bypass Google OAuth for local testing
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const DEV_USERS: Record<string, { email: string; password: string }> = {
  alice: { email: 'alice@dev.local', password: 'devlocal123!' },
  bob:   { email: 'bob@dev.local',   password: 'devlocal123!' },
  carlos:{ email: 'carlos@dev.local',password: 'devlocal123!' },
};

export default function DevLogin() {
  const navigate = useNavigate();
  const who = new URLSearchParams(window.location.search).get('as') || 'alice';

  useEffect(() => {
    const creds = DEV_USERS[who] || DEV_USERS.alice;
    supabase.auth.signInWithPassword(creds).then(({ data, error }) => {
      if (error) { document.body.innerText = `Dev login error: ${error.message}`; return; }
      navigate('/map', { replace: true });
    });
  }, [who, navigate]);

  return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'sans-serif'}}>Signing in as {who}...</div>;
}
