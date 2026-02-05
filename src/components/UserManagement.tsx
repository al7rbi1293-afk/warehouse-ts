"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UserList } from "./UserList";
import { UserModal } from "./UserModal";
import { User, Shift, Region } from "@/types";
import { deleteUser } from "@/app/actions/users";

interface UserManagementProps {
    users: User[];
    shifts: Shift[];
    regions: Region[];
}

export function UserManagement({ users: initialUsers, shifts, regions }: UserManagementProps) {
    const router = useRouter();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleOpenModal = (user?: User) => {
        setEditingUser(user || null);
        setIsModalOpen(true);
    };

    const handleDelete = async (username: string) => {
        if (!confirm("Are you sure you want to delete this user?")) return;
        if (isDeleting) return;

        setIsDeleting(true);
        const toastId = toast.loading("Deleting user...");

        try {
            const res = await deleteUser(username);
            if (res.success) {
                toast.success("User deleted", { id: toastId });
                router.refresh();
            } else {
                toast.error(res.message, { id: toastId });
            }
        } catch {
            toast.error("An error occurred", { id: toastId });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSuccess = () => {
        router.refresh();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">System Users</h2>
                    <p className="text-sm text-slate-500">Manage access and roles</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
                    New User
                </button>
            </div>

            <UserList
                users={initialUsers}
                onEdit={handleOpenModal}
                onDelete={handleDelete}
            />

            <UserModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={editingUser}
                shifts={shifts}
                regions={regions}
                onSuccess={handleSuccess}
            />
        </div>
    );
}
