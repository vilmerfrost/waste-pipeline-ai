import { login } from "./actions";

export default function LoginPage({ searchParams }: { searchParams: any }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-center mb-6">Logga in</h2>
        
        <form action={login} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input name="email" type="email" required className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Lösenord</label>
            <input name="password" type="password" required className="w-full border p-2 rounded" />
          </div>
          
          <button className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-500">
            Logga in
          </button>
        </form>
      </div>
    </div>
  );
}