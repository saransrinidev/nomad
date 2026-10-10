// Seeded population simulator for Tamil Nadu settlements.
// Deterministic: same population + district always yields the same people.
// Usage: node generate-residents.mjs [population=25] [District=Thanjavur]
// Prints a JSON array of residents to stdout.
//
// Each resident: id (district-N), Tamil display name, gender, age, homeNo,
// profession (society model: farmers / homemakers / students / elders /
// toddlers; facility jobs like doctor/teacher appear only when the
// settlement calculator earns those buildings), workplace + travelMode.
// Everyone travels by walk (no vehicles in the village sim).

function mulberry(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    const t = s >>> 0;
    return t / 4294967296;
  };
}

const MALE_NAMES = [
  "Murugan", "Karthik", "Ramesh", "Suresh", "Velu", "Kumar", "Anand",
  "Prabhu", "Mani", "Rajan", "Kathir", "Elango", "Sivam", "Dinesh",
  "Arun", "Bala", "Chandran", "Deva", "Ezhil", "Gopal",
];
const FEMALE_NAMES = [
  "Lakshmi", "Divya", "Priya", "Anitha", "Meena", "Revathi", "Shanthi",
  "Kowsalya", "Selvi", "Thenmozhi", "Poongodi", "Amutha", "Kavya",
  "Deepa", "Eswari", "Gayathri", "Hema", "Indra", "Janani", "Kala",
];

// Society shares (must sum to 1). Facility jobs are NOT in this split:
// they come from settlement amenities (hospital -> doctor, etc.).
const SHARES = [
  ["farmer", 0.32],
  ["homemaker", 0.2],
  ["student", 0.24],
  ["elder", 0.16],
  ["toddler", 0.08],
];

const AGE_RANGE = {
  farmer: [22, 55],
  homemaker: [22, 55],
  student: [6, 17],
  elder: [61, 80],
  toddler: [2, 5],
};

const FARM_PLOTS = 8;

// Attire pools per profession (reuse-player look, different dress).
// Stored per resident in JSON so the renderer is pure data + parameters.
const SKINS = ["#8d5a3b", "#6b4230", "#a06a45", "#7a4a33"];
const ATTIRE = {
  farmer: { shirts: ["#5a7a3a", "#7a6a3a", "#4a6a8a", "#8a5a2e"], pants: ["#e8e4da", "#d8cfc0", "#f0ece2"] },
  homemaker: { shirts: ["#c0392b", "#d4762b", "#7a4a8a", "#2e8a6e", "#b83a5e"], pants: null }, // pants = shirt (saree)
  student: { shirts: ["#e8e8e8", "#f0f0f0", "#d0d8e8"], pants: ["#2f4d7d", "#3a3a4a"] },
  elder: { shirts: ["#e8e4da", "#f0ece2"], pants: ["#e8e4da", "#f0ece2"] },
  toddler: { shirts: ["#d43a2e", "#2e8ad4", "#e8b62e"], pants: ["#2f4d7d", "#6b5a3e", "#3d3d4a"] },
};

function main() {
  const population = Math.max(1, parseInt(process.argv[2] ?? "25", 10) || 25);
  const district = (process.argv[3] ?? "Thanjavur").trim() || "Thanjavur";
  const slug = district.toLowerCase().replace(/[^a-z]+/g, "");
  const rand = mulberry(population * 7919 + slug.length * 131);

  // Counts per profession (largest-remainder, deterministic order).
  const counts = SHARES.map(([job, share]) => ({ job, n: Math.floor(population * share) }));
  let assigned = counts.reduce((a, c) => a + c.n, 0);
  let k = 0;
  while (assigned < population) {
    counts[k % counts.length].n += 1;
    assigned += 1;
    k += 1;
  }

  // Gender-balanced pool, seeded shuffle.
  const males = Math.ceil(population / 2);
  const genders = [...Array(males).fill("male"), ...Array(population - males).fill("female")];
  for (let i = genders.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [genders[i], genders[j]] = [genders[j], genders[i]];
  }

  // Name pools (cycle if population exceeds pool, offset by seed).
  const mi = Math.floor(rand() * MALE_NAMES.length);
  const fi = Math.floor(rand() * FEMALE_NAMES.length);
  let mn = 0;
  let fn = 0;
  const pickName = (g) =>
    g === "male" ? MALE_NAMES[(mi + mn++) % MALE_NAMES.length] : FEMALE_NAMES[(fi + fn++) % FEMALE_NAMES.length];

  // Flat list of (profession) slots, then seeded shuffle into people.
  const jobs = [];
  for (const c of counts) for (let i = 0; i < c.n; i++) jobs.push(c.job);
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }

  const HOUSEHOLD = 5;
  const homes = Math.max(1, Math.ceil(population / HOUSEHOLD));
  let farmerIdx = 0;

  const residents = jobs.map((profession, i) => {
    const gender = genders[i];
    const [lo, hi] = AGE_RANGE[profession];
    const age = lo + Math.floor(rand() * (hi - lo + 1));
    const homeNo = (i % homes) + 1;
    const attire = ATTIRE[profession];
    const shirt = attire.shirts[Math.floor(rand() * attire.shirts.length)];
    const pants = attire.pants ? attire.pants[Math.floor(rand() * attire.pants.length)] : shirt;
    const skin = SKINS[Math.floor(rand() * SKINS.length)];
    const hair = profession === "elder" ? "#c0c0c0" : "#14100d";
    const workplace =
      profession === "farmer"
        ? { place: "farm", plot: (farmerIdx++ % FARM_PLOTS) + 1 }
        : profession === "student"
          ? { place: "home", note: "walks to village school when one exists" }
          : { place: "home" };
    return {
      id: `${slug}-${i + 1}`,
      name: pickName(gender),
      gender,
      age,
      homeNo,
      profession,
      appearance: { shirt, pants, skin, hair },
      workplace,
      travelMode: "walk",
    };
  });

  console.log(JSON.stringify(residents, null, 2));
}

main();
