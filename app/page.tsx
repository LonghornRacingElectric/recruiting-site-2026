import Hero from "@/components/Hero";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <Hero />

      <section className="py-20 bg-neutral-900/50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Engineering Excellence",
                description: "Work with cutting-edge technology and solve complex engineering challenges."
              },
              {
                title: "Hands-on Experience",
                description: "Apply classroom theory to real-world problems in a fast-paced environment."
              },
              {
                title: "Community",
                description: "Join a passionate team of students dedicated to innovation and racing."
              }
            ].map((item, index) => (
              <div key={index} className="p-6 rounded-2xl bg-neutral-900 border border-white/5 hover:border-red-600/50 transition-colors group">
                <h3 className="text-xl font-bold mb-3 text-white group-hover:text-red-500 transition-colors">{item.title}</h3>
                <p className="text-neutral-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
