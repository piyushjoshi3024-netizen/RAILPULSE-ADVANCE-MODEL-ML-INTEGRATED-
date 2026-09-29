import { UserCircle } from "lucide-react";

function Header() {
  return (
    <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8">
      
      <div>
        <p className="text-sm text-slate-500">
          Real-time railway intelligence and control
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-green-200 bg-green-50">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>

          <span className="text-sm font-medium text-green-700">
            System Online
          </span>
        </div>

        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
          <UserCircle size={22} className="text-blue-600" />
        </div>
      </div>

    </header>
  );
}

export default Header;