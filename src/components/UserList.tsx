import { User } from "@/types";

interface UserListProps {
    users: User[];
    onEdit: (user: User) => void;
    onDelete: (username: string) => void;
}

export function UserList({ users, onEdit, onDelete }: UserListProps) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAFC] border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-slate-600">Name</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Username</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Employee ID</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Role</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Region</th>
                            <th className="px-6 py-4 font-semibold text-slate-600">Shift</th>
                            <th className="px-6 py-4 font-semibold text-slate-600 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {users.map((user) => (
                            <tr key={user.username} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-900">{user.name}</td>
                                <td className="px-6 py-4 text-slate-600">{user.username}</td>
                                <td className="px-6 py-4 text-slate-600 font-mono text-xs">{user.employeeId || "-"}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                                        ${user.role === 'manager' ? 'bg-purple-100 text-purple-700' :
                                            user.role === 'supervisor' ? 'bg-blue-100 text-blue-700' :
                                                'bg-slate-100 text-slate-700'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-slate-600">{user.region || "-"}</td>
                                <td className="px-6 py-4 text-slate-600">{user.shiftName || "-"}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => onEdit(user)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => onDelete(user.username)}
                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
