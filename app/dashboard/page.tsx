export default function Dashboard() {
    return (
        <main className="min-h-screen bg-black pt-24 pb-20">
            <div className="container mx-auto px-4">
                <div className="mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                        Member <span className="text-red-600">Dashboard</span>
                    </h1>
                    <p className="text-neutral-400">
                        Welcome back! Here's what's happening at Longhorn Racing Electric.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Announcements Card */}
                    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 hover:border-red-600/50 transition-colors">
                        <h2 className="text-xl font-bold text-white mb-4">Announcements</h2>
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-black/50 border border-white/5">
                                <span className="text-xs font-medium text-red-500 mb-1 block">New</span>
                                <h3 className="text-sm font-bold text-white mb-1">General Meeting</h3>
                                <p className="text-xs text-neutral-400">Join us this Friday at 5 PM for our weekly general meeting.</p>
                            </div>
                            <div className="p-4 rounded-lg bg-black/50 border border-white/5">
                                <h3 className="text-sm font-bold text-white mb-1">Workshop Safety</h3>
                                <p className="text-xs text-neutral-400">Please review the updated safety guidelines before entering the shop.</p>
                            </div>
                        </div>
                    </div>

                    {/* Upcoming Events Card */}
                    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 hover:border-red-600/50 transition-colors">
                        <h2 className="text-xl font-bold text-white mb-4">Upcoming Events</h2>
                        <ul className="space-y-3">
                            <li className="flex items-center justify-between p-3 rounded-lg bg-black/50 border border-white/5">
                                <span className="text-sm text-white">Design Review</span>
                                <span className="text-xs text-neutral-500">Nov 20</span>
                            </li>
                            <li className="flex items-center justify-between p-3 rounded-lg bg-black/50 border border-white/5">
                                <span className="text-sm text-white">Social Night</span>
                                <span className="text-xs text-neutral-500">Nov 22</span>
                            </li>
                            <li className="flex items-center justify-between p-3 rounded-lg bg-black/50 border border-white/5">
                                <span className="text-sm text-white">Testing Day</span>
                                <span className="text-xs text-neutral-500">Nov 25</span>
                            </li>
                        </ul>
                    </div>

                    {/* Resources Card */}
                    <div className="p-6 rounded-2xl bg-neutral-900 border border-white/5 hover:border-red-600/50 transition-colors">
                        <h2 className="text-xl font-bold text-white mb-4">Resources</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <a href="#" className="p-4 rounded-lg bg-black/50 border border-white/5 hover:bg-neutral-800 transition-colors text-center">
                                <span className="block text-2xl mb-2">📂</span>
                                <span className="text-xs font-medium text-white">Drive</span>
                            </a>
                            <a href="#" className="p-4 rounded-lg bg-black/50 border border-white/5 hover:bg-neutral-800 transition-colors text-center">
                                <span className="block text-2xl mb-2">💬</span>
                                <span className="text-xs font-medium text-white">Slack</span>
                            </a>
                            <a href="#" className="p-4 rounded-lg bg-black/50 border border-white/5 hover:bg-neutral-800 transition-colors text-center">
                                <span className="block text-2xl mb-2">📅</span>
                                <span className="text-xs font-medium text-white">Calendar</span>
                            </a>
                            <a href="#" className="p-4 rounded-lg bg-black/50 border border-white/5 hover:bg-neutral-800 transition-colors text-center">
                                <span className="block text-2xl mb-2">⚙️</span>
                                <span className="text-xs font-medium text-white">Wiki</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
