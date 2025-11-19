export default function AboutPage() {
    return (
        <main className="min-h-screen bg-black pt-24 pb-20">
            <div className="container mx-auto px-4">
                {/* Mission Section */}
                <section className="mb-20 text-center">
                    <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-white mb-6">
                        Our <span className="text-red-600">Mission</span>
                    </h1>
                    <p className="text-lg text-neutral-400 max-w-3xl mx-auto">
                        Longhorn Racing Electric is dedicated to designing, building, and racing high-performance electric vehicles.
                        We strive to push the boundaries of sustainable transportation while providing students with hands-on engineering experience.
                    </p>
                </section>

                {/* Sub-teams Grid */}
                <section>
                    <h2 className="text-3xl font-bold text-white mb-10 text-center">Our Sub-teams</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {[
                            {
                                name: "Aerodynamics",
                                description: "Designing wings and bodywork to maximize downforce and minimize drag."
                            },
                            {
                                name: "Chassis",
                                description: "Engineering the structural core of the vehicle for safety and performance."
                            },
                            {
                                name: "Powertrain",
                                description: "Developing the battery pack, motor, and inverter systems."
                            },
                            {
                                name: "Electronics",
                                description: "Creating custom PCBs and wiring harnesses for vehicle control."
                            },
                            {
                                name: "Suspension",
                                description: "Optimizing vehicle handling and dynamics."
                            },
                            {
                                name: "Business",
                                description: "Managing finances, sponsorship, and marketing."
                            }
                        ].map((team, index) => (
                            <div key={index} className="p-8 rounded-2xl bg-neutral-900 border border-white/5 hover:border-red-600/50 transition-colors">
                                <h3 className="text-2xl font-bold text-white mb-4">{team.name}</h3>
                                <p className="text-neutral-400">{team.description}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
