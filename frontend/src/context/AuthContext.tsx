import {createContext,useContext,useEffect,useMemo,useState,ReactNode} from 'react';
import {authApi,Role,User} from '../lib/api';
type AuthContextValue={user:User|null;loading:boolean;login:(email:string,password:string)=>Promise<void>;register:(data:Record<string,unknown>)=>Promise<void>;logout:()=>void};
const AuthContext=createContext<AuthContextValue|null>(null);
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
 useEffect(()=>{if(localStorage.getItem('hp_token')) authApi.me().then(r=>setUser(r.user)).catch(()=>localStorage.removeItem('hp_token')).finally(()=>setLoading(false)); else setLoading(false)},[]);
 const save=(r:{user:User;token:string})=>{localStorage.setItem('hp_token',r.token);setUser(r.user)};
 const value=useMemo(()=>({user,loading,login:async(e:string,p:string)=>save(await authApi.login({email:e,password:p})),register:async(d:Record<string,unknown>)=>save(await authApi.register(d)),logout:()=>{localStorage.removeItem('hp_token');setUser(null)} }),[user,loading]);return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>}
export const useAuth=()=>{const c=useContext(AuthContext);if(!c)throw new Error('useAuth must be used within AuthProvider');return c};
export const roleLabel=(role:Role)=>role.charAt(0)+role.slice(1).toLowerCase();
