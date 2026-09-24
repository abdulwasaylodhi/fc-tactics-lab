// =============================================================================
//  fc_strategy.cpp  -  Picks the best FC Mobile Manager Mode formation + strategy
// =============================================================================
//
//  LESSON 0 - What is this file?
//  C++ is a *compiled* language. This text file is "source code". A program
//  called a compiler (g++) reads it and produces fc_strategy.exe, a file of raw
//  machine instructions your CPU runs directly. No interpreter sits in between,
//  which is why C++ is one of the fastest languages that exists.
//
//      Build:  g++ -O2 -std=c++11 -static -o fc_strategy.exe fc_strategy.cpp
//              (or open it in Dev-C++ and press F11 = Compile & Run)
//      Run:    .\fc_strategy.exe                   (best overall)
//              .\fc_strategy.exe --style attack    (prefer attacking shapes)
//              .\fc_strategy.exe --style defend --top 5
//              .\fc_strategy.exe --alt-penalty 2   (if alternate positions start costing OVR)
//
//  "//" starts a comment: the compiler ignores everything after it on that line.
// =============================================================================

// LESSON 1 - #include
// C++ has almost nothing built in. You pull in pieces of the *standard library*
// with #include. Each one is like importing a toolbox.
#include <algorithm>  // std::sort, std::max, std::min
#include <cmath>      // std::abs, std::lround
#include <cstdlib>    // std::atoi
#include <fstream>    // std::ifstream - reading files
#include <iomanip>    // std::setw, std::setprecision - pretty printing
#include <iostream>   // std::cout (print to screen), std::cerr (print errors)
#include <limits>     // std::numeric_limits - the largest int, etc.
#include <map>        // std::map - a dictionary (key -> value)
#include <sstream>    // std::stringstream - treat a string like a mini file
#include <stdexcept>  // std::runtime_error - for reporting problems
#include <string>     // std::string - text
#include <vector>     // std::vector - a growable list

// LESSON 2 - The "std::" prefix
// Everything from the standard library lives in a *namespace* called std.
// std::string means "the string that belongs to std". Many tutorials write
// `using namespace std;` to skip typing it - real projects avoid that because
// it causes name clashes, so we write std:: every time.

// -----------------------------------------------------------------------------
// LESSON 3 - struct: bundling data together
// A struct is a custom type made of named fields. Think of it as a blueprint;
// every Player you create gets its own copy of these fields.
// -----------------------------------------------------------------------------
struct Player {
    std::string name;
    std::string mainPos;                // e.g. "LW"
    int mainRating = 0;                 // e.g. 126   (int = whole number)
    std::vector<std::string> alternates;// "Alternate Positions" printed on the card: "LM", "ST"
    std::map<std::string, int> known;   // other positions the game showed us: "ST" -> 119
};

struct Formation {
    std::string name;                   // "4-3-3 Attack"
    std::string tags;                   // "Attacking/Recommended"
    std::vector<std::string> slots;     // the 11 positions: GK, LB, CB, ...
};

struct Pick {                           // who plays in one slot
    int player = -1;                    // index into the squad vector
    int rating = 0;                     // their rating *in that slot*
    bool alternate = false;             // true if the slot is one of the card's alternate positions
    bool estimated = false;             // true if we guessed (game didn't show it)
};

struct Result {                         // how good one formation is for your squad
    const Formation* formation = nullptr;   // LESSON 4: a pointer (see below)
    std::vector<Pick> picks;                 // one Pick per slot
    double average = 0;                      // double = number with decimals
    int weakest = 0;
    double score = 0;
};
// LESSON 4 - Pointers
// `const Formation*` is a *pointer*: it stores the memory address of a
// Formation instead of a full copy. Copying is wasteful; pointing is cheap.
// `const` promises we will only read through it, never modify. nullptr = "points
// at nothing yet".

// -----------------------------------------------------------------------------
// Pitch geometry - used to ESTIMATE ratings the game didn't show us.
// x = across the pitch (0 = left touchline, 4 = right), y = up the pitch (0 = own goal).
// -----------------------------------------------------------------------------
struct Spot { double x, y; };

// LESSON 5 - const and initializer lists
// `const` = can never change after creation. The { {...}, {...} } syntax fills
// the map in one go. kPitch.at("CB") will give back {2, 1}.
const std::map<std::string, Spot> kPitch = {
    {"GK",  {2, 0}},
    {"LB",  {0, 1}},   {"CB", {2, 1}},   {"RB",  {4, 1}},
    {"LWB", {0, 1.5}},                   {"RWB", {4, 1.5}},
                       {"CDM", {2, 2}},
    {"LM",  {0, 3}},   {"CM",  {2, 3}},  {"RM",  {4, 3}},
                       {"CAM", {2, 4}},
    {"LW",  {0, 4}},   {"CF",  {2, 4.5}},{"RW",  {4, 4}},
                       {"ST",  {2, 5}},
};

// LESSON 6 - Functions
// Syntax:  return_type name(parameters) { body }
// `const std::string& pos` means "give me the caller's string by *reference*
// (&), read-only (const)". A reference is an alias - no copy is made. This is a
// habit you'll see everywhere in fast C++ code.
bool isValidPosition(const std::string& pos) { return kPitch.count(pos) > 0; }

int sideOf(const std::string& pos) {            // -1 left flank, 0 middle, +1 right flank
    if (pos[0] == 'L') return -1;               // pos[0] = first character. 'L' is a char, "L" is a string
    if (pos[0] == 'R') return +1;
    return 0;
}
bool isForward(const std::string& p)  { return p == "ST" || p == "CF" || p == "LW" || p == "RW"; }
bool isBackline(const std::string& p) { return p == "CB" || p == "LB" || p == "RB" || p == "LWB" || p == "RWB" || p == "CDM"; }
bool isCentralDeep(const std::string& p) { return p == "CM" || p == "CDM" || p == "CB"; }

// How many rating points a player loses moving from `from` to `to`.
// Tuned to match what your screenshots show, e.g. CDM->CM is -4 (Caicedo, Kimmich),
// LW->ST is about -7 (Hazard), a winger dropped into CM loses ~18 (Messi, Hazard).
int positionPenalty(const std::string& from, const std::string& to) {
    if (from == to) return 0;
    if (from == "GK" || to == "GK") return 60;              // outfielders can't keep goal

    Spot a = kPitch.at(from), b = kPitch.at(to);
    double cost = 2.0 * std::abs(a.x - b.x)                 // moving sideways costs a little
                + 4.0 * std::abs(a.y - b.y);                // moving up/down the pitch costs more

    if (sideOf(from) * sideOf(to) < 0) cost += 10;          // left <-> right flank swap
    if (isForward(from) && isCentralDeep(to)) cost += 10;   // attacker forced into CM/CDM/CB
    if (isBackline(from) && isForward(to)) cost += 6;       // defender forced up front

    return static_cast<int>(std::lround(cost));             // LESSON 7: static_cast converts types explicitly
}

// How many points a player loses in one of the card's alternate positions.
// Your screenshots show 0 (Hazard LM 126, Kimmich RB 126, Gullit CAM 122), probably because
// the skill tree's "Alternate Level" is maxed. Changeable with --alt-penalty N.
// LESSON 8a - a global variable: declared outside every function, so all of them can see it.
// Handy for one program-wide setting; for anything more, pass values as parameters instead.
int gAlternatePenalty = 0;

bool isAlternate(const Player& p, const std::string& pos) {
    // std::find walks the vector and returns end() if pos isn't in it.
    return std::find(p.alternates.begin(), p.alternates.end(), pos) != p.alternates.end();
}

// Rating of player p in position pos. Returns TWO values bundled in a Pick.
// Priority: real number from the game  >  card's alternate position  >  estimate.
Pick ratingAt(const Player& p, const std::string& pos) {
    Pick result;
    if (pos == p.mainPos) { result.rating = p.mainRating; return result; }

    // LESSON 8 - map lookup with find()
    // find() returns an "iterator". If the key is missing it equals end().
    // `auto` asks the compiler to work out the (long, ugly) type for us.
    auto it = p.known.find(pos);
    if (it != p.known.end()) { result.rating = it->second; return result; }  // ->second is the value

    if (isAlternate(p, pos)) {
        result.rating = p.mainRating - gAlternatePenalty;
        result.alternate = true;
        return result;
    }

    // Not shown in-game: estimate from every position we DO know, keep the best.
    int best = p.mainRating - positionPenalty(p.mainPos, pos);
    // LESSON 9 - range-based for loop over a map
    // "for each entry inside p.known". Each entry is a pair: .first = key, .second = value.
    for (const auto& entry : p.known)
        best = std::max(best, entry.second - positionPenalty(entry.first, pos));
    for (const std::string& alt : p.alternates)          // alternates are good starting points too
        best = std::max(best, p.mainRating - gAlternatePenalty - positionPenalty(alt, pos));

    result.rating = best;
    result.estimated = true;
    return result;
}

// -----------------------------------------------------------------------------
// Small text helpers
// -----------------------------------------------------------------------------
std::string trim(const std::string& s) {
    size_t first = s.find_first_not_of(" \t\r");   // size_t = unsigned int for sizes/indexes
    if (first == std::string::npos) return "";      // npos = "not found"
    size_t last = s.find_last_not_of(" \t\r");
    return s.substr(first, last - first + 1);
}

std::vector<std::string> split(const std::string& s, char separator) {
    std::vector<std::string> parts;
    std::stringstream stream(s);
    std::string piece;
    while (std::getline(stream, piece, separator))   // read up to each separator
        parts.push_back(trim(piece));                 // push_back = append to the end
    return parts;
}

std::vector<std::string> words(const std::string& s) {   // split on any whitespace
    std::vector<std::string> out;
    std::stringstream stream(s);
    std::string w;
    while (stream >> w) out.push_back(w);             // >> reads one word at a time
    return out;
}

// -----------------------------------------------------------------------------
// LESSON 10 - Reading files + exceptions
// std::ifstream opens a file for reading. If something is wrong we `throw` an
// exception; it flies up the call stack until a `catch` (in main) handles it.
// -----------------------------------------------------------------------------
std::vector<Player> loadPlayers(const std::string& path) {
    std::ifstream file(path);
    if (!file) throw std::runtime_error("cannot open " + path);

    std::vector<Player> squad;
    std::string line;
    int lineNo = 0;
    while (std::getline(file, line)) {
        ++lineNo;
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;          // skip blanks and comments

        std::vector<std::string> f = split(line, ',');
        std::string where = path + " line " + std::to_string(lineNo);
        if (f.size() < 3) throw std::runtime_error(where + ": need Name, Position, Rating");

        Player p;
        p.name = f[0];
        p.mainPos = f[1];
        if (!isValidPosition(p.mainPos)) throw std::runtime_error(where + ": unknown position " + p.mainPos);
        try {
            p.mainRating = std::stoi(f[2]);                     // stoi = "string to int"
            // Columns 4 and 5 (alternates, seen ratings) hold the same kind of words, so read
            // every word after the rating: "ST=119" is a seen rating, a bare "LM" is an
            // alternate position, and "-" means "none".
            for (size_t col = 3; col < f.size(); ++col) {
                for (const std::string& entry : words(f[col])) {
                    if (entry == "-") continue;
                    size_t eq = entry.find('=');
                    std::string pos = entry.substr(0, eq);      // whole word if there's no '='
                    if (!isValidPosition(pos)) throw std::runtime_error("unknown position " + pos);
                    if (eq == std::string::npos) p.alternates.push_back(pos);
                    else                         p.known[pos] = std::stoi(entry.substr(eq + 1));
                }
            }
        } catch (const std::invalid_argument&) {                // stoi throws this on non-numbers
            throw std::runtime_error(where + ": bad number");
        } catch (const std::runtime_error& e) {
            throw std::runtime_error(where + ": " + e.what());
        }
        squad.push_back(p);
    }
    return squad;
}

std::vector<Formation> loadFormations(const std::string& path) {
    std::ifstream file(path);
    if (!file) throw std::runtime_error("cannot open " + path);

    std::vector<Formation> list;
    std::string line;
    int lineNo = 0;
    while (std::getline(file, line)) {
        ++lineNo;
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;

        std::vector<std::string> f = split(line, ',');
        std::string where = path + " line " + std::to_string(lineNo);
        if (f.size() != 3) throw std::runtime_error(where + ": need Name, Tags, Positions");

        Formation form{f[0], f[1], words(f[2])};               // brace-initialise all 3 fields in order
        if (form.slots.size() != 11) throw std::runtime_error(where + ": needs exactly 11 positions");
        for (const std::string& pos : form.slots)
            if (!isValidPosition(pos)) throw std::runtime_error(where + ": unknown position " + pos);
        list.push_back(form);
    }
    return list;
}

// -----------------------------------------------------------------------------
// LESSON 11 - The algorithm: who plays where?
// For each formation we must put 11 of your players into 11 slots so the total
// rating is as high as possible. Trying every combination is hopeless:
// 18 players into 11 slots = 18!/7! ≈ 1.3 * 10^12 lineups.
//
// This is a classic problem called the *assignment problem*, and the Hungarian
// algorithm solves it EXACTLY in about slots^2 * players steps (~2,000 here).
// It works on "costs" to minimise, so we feed it cost = -rating.
//
// You don't need to follow every line below yet. The idea: it keeps a "price"
// for every slot (u) and every player (v), and repeatedly finds the cheapest
// way to seat one more slot, adjusting prices so earlier choices stay optimal.
// -----------------------------------------------------------------------------
std::vector<int> hungarian(const std::vector<std::vector<int>>& cost) {
    const int n = static_cast<int>(cost.size());       // slots   (rows)
    const int m = static_cast<int>(cost[0].size());    // players (columns), m >= n
    const int INF = std::numeric_limits<int>::max() / 2;

    // Arrays are 1-based here: index 0 is a helper "virtual" column.
    std::vector<int> u(n + 1, 0), v(m + 1, 0), owner(m + 1, 0), way(m + 1, 0);

    for (int row = 1; row <= n; ++row) {
        owner[0] = row;
        int col0 = 0;
        std::vector<int> minv(m + 1, INF);
        std::vector<bool> used(m + 1, false);
        do {
            used[col0] = true;
            int row0 = owner[col0], delta = INF, col1 = 0;
            for (int col = 1; col <= m; ++col) {
                if (used[col]) continue;
                int reduced = cost[row0 - 1][col - 1] - u[row0] - v[col];
                if (reduced < minv[col]) { minv[col] = reduced; way[col] = col0; }
                if (minv[col] < delta)   { delta = minv[col];   col1 = col; }
            }
            for (int col = 0; col <= m; ++col) {
                if (used[col]) { u[owner[col]] += delta; v[col] -= delta; }
                else           { minv[col] -= delta; }
            }
            col0 = col1;
        } while (owner[col0] != 0);
        do {                                              // walk back and flip the path
            int col1 = way[col0];
            owner[col0] = owner[col1];
            col0 = col1;
        } while (col0 != 0);
    }

    std::vector<int> slotToPlayer(n, -1);
    for (int col = 1; col <= m; ++col)
        if (owner[col] != 0) slotToPlayer[owner[col] - 1] = col - 1;
    return slotToPlayer;
}

// Does this formation's in-game tag match the style the user asked for?
bool matchesStyle(const Formation& f, const std::string& style) {
    auto has = [&](const char* tag) {                    // LESSON 12: a lambda (inline mini-function)
        return f.tags.find(tag) != std::string::npos;    // [&] lets it see `f` from outside
    };
    if (style == "attack")   return has("Attacking") || has("Full Attack");
    if (style == "defend")   return has("Defensive") || has("Five Defenders");
    if (style == "balanced") return has("Balanced");
    return false;                                        // style "any": nobody gets a bonus
}

Result evaluate(const Formation& f, const std::vector<Player>& squad, const std::string& style) {
    // Build the cost table: rows = slots, columns = players.
    // LESSON 13 - a vector of vectors is a 2-D grid. size() rows, each with squad.size() columns.
    std::vector<std::vector<int>> cost(f.slots.size(), std::vector<int>(squad.size()));
    for (size_t s = 0; s < f.slots.size(); ++s)
        for (size_t p = 0; p < squad.size(); ++p)
            cost[s][p] = -ratingAt(squad[p], f.slots[s]).rating;

    std::vector<int> assignment = hungarian(cost);

    Result r;
    r.formation = &f;                                    // & in front of a variable = "address of"
    r.weakest = std::numeric_limits<int>::max();
    int total = 0;
    for (size_t s = 0; s < f.slots.size(); ++s) {
        Pick pick = ratingAt(squad[assignment[s]], f.slots[s]);
        pick.player = assignment[s];
        r.picks.push_back(pick);
        total += pick.rating;
        r.weakest = std::min(r.weakest, pick.rating);
    }
    r.average = static_cast<double>(total) / f.slots.size();

    // Score: 90% team average + 10% weakest player (opponents target your weak link),
    // plus +1 if the formation fits the style you asked for.
    r.score = 0.9 * r.average + 0.1 * r.weakest + (matchesStyle(f, style) ? 1.0 : 0.0);
    // LESSON 14: `condition ? a : b` is the ternary operator - a one-line if/else.
    return r;
}

// -----------------------------------------------------------------------------
// Strategy: read the strengths of the chosen lineup and turn them into advice.
// -----------------------------------------------------------------------------
double averageOf(const std::vector<int>& values) {
    if (values.empty()) return 0;
    double sum = 0;
    for (int x : values) sum += x;
    return sum / values.size();
}

void printStrategy(const Result& r, const std::vector<Player>& squad, const std::string& style) {
    std::vector<int> defence, midfield, attack, wide, central;
    const std::vector<std::string>& slots = r.formation->slots;   // -> reads a field through a pointer

    for (size_t s = 0; s < slots.size(); ++s) {
        const std::string& pos = slots[s];
        int rating = r.picks[s].rating;
        if (pos == "GK") continue;
        if (pos == "CB" || pos == "LB" || pos == "RB" || pos == "LWB" || pos == "RWB") defence.push_back(rating);
        else if (isForward(pos)) attack.push_back(rating);
        else midfield.push_back(rating);
        (sideOf(pos) != 0 ? wide : central).push_back(rating);
    }

    double def = averageOf(defence), mid = averageOf(midfield), att = averageOf(attack);
    double wing = averageOf(wide), middle = averageOf(central);

    std::cout << std::fixed << std::setprecision(1);
    std::cout << "\nLINE STRENGTH   Defence " << def << "  |  Midfield " << mid << "  |  Attack " << att << "\n";
    std::cout << "CHANNELS        Wide " << wing << "  |  Central " << middle << "\n";

    // Two readings drive every setting below:
    //   lean  : +1 attack is the best line, -1 defence is, 0 neither (within 2 points)
    //   focus : +1 wide players are stronger, -1 central players are (or no wide players), 0 even
    int lean = 0;
    if (att - def >= 2) lean = +1;
    else if (def - att >= 2) lean = -1;
    if (lean == 0 && style == "attack") lean = +1;     // squad has no clear lean: follow the user's wish
    if (lean == 0 && style == "defend") lean = -1;
    int focus = 0;
    if (wide.empty() || wing - middle <= -1.5) focus = -1;
    else if (wing - middle >= 1.5) focus = +1;
    const double teamAvg = r.average;

    // In FC Mobile every slider runs 1-3, and the tactics screen has three tabs:
    // Build Up, Offence and Defence. We print them in the same order so you can copy them across.
    auto level = [](int n) {
        const char* names[] = {"", "1 (Low)", "2 (Mid)", "3 (High)"};
        return std::string(names[n]);
    };
    auto row = [](const std::string& name, const std::string& value, const std::string& why) {
        std::cout << "    " << std::left << std::setw(19) << name << std::setw(13) << value << why << "\n";
    };

    const char* preset = lean > 0 ? "Attacking" : lean < 0 ? "Counter" : "Control";
    std::cout << "\nTACTICS  (Manager Mode > Tactics > Custom; closest preset: " << preset << ")\n";

    std::cout << "  BUILD UP\n";
    if (lean > 0)      row("Speed", level(3), "attacking set-up - get the ball to the forwards early");
    else if (lean < 0) row("Speed", level(3), "counter: break before the opponent recovers its shape");
    else               row("Speed", level(2), "steady tempo - keep the ball, don't force it");
    if (lean < 0)       row("Passing Distance", level(3), "long balls over the top on the break");
    else if (focus > 0) row("Passing Distance", level(2), "switch play out to the wingers");
    else                row("Passing Distance", level(1), "short passes keep possession");
    row("Mentality", lean > 0 ? "Attacking" : lean < 0 ? "Defensive" : "Balanced",
        lean > 0 ? "pushes the whole team (and the back line) higher"
        : lean < 0 ? "drop deep, let the defence do the work" : "no line clearly stronger than another");
    row("Positioning", lean < 0 ? "Organised" : "Free",
        lean < 0 ? "hold shape so you can't be countered" : "lets creative players roam into space");

    std::cout << "  OFFENCE\n";
    row("Passing Tendency", level(focus < 0 ? 3 : 2),
        focus < 0 ? "strength is central - through balls and one-twos" : "mix passing with wide play");
    row("Cross Tendency", level(focus > 0 ? 3 : focus < 0 ? 1 : 2),
        focus > 0 ? "strength is wide - get it into the box"
        : focus < 0 ? "few/weaker wide players - crosses waste the ball" : "cross when the winger is free");
    row("Shooting Tendency", level(att >= teamAvg + 0.5 ? 3 : 2),
        att >= teamAvg + 0.5 ? "forwards are above team average - shoot on sight" : "work a clear chance first");
    row("Positioning", lean < 0 ? "Organised" : "Free",
        lean < 0 ? "runners stay in lanes for quick counters" : "forwards drift into gaps");

    std::cout << "  DEFENCE\n";
    row("Pressure", level(lean > 0 ? 3 : lean < 0 ? 1 : 2),
        lean > 0 ? "win it back high up the pitch" : lean < 0 ? "don't get pulled out of shape" : "press in midfield only");
    const bool threeAtBack = defence.size() == 3;
    row("Width", level(threeAtBack ? 2 : 1),
        threeAtBack ? "only 3 at the back - midfielders must cover the flanks" : "stay narrow and compact; force them wide");
    row("Aggression", level(def >= teamAvg ? 3 : 2),
        def >= teamAvg ? "defenders are above team average - go win the tackles" : "back line isn't above team average - stay on your feet");
    const bool trap = lean > 0 && def >= teamAvg;
    row("Back Line", trap ? "Offside Trap" : "Cover",
        trap ? "high line + strong defenders catch runners offside" : "safer - defenders sweep behind the ball");

    std::cout << "\n  IN-MATCH CHANGES (you can edit tactics during the match)\n"
              << "    2+ goals up : Speed 1, Mentality Defensive, Positioning Organised, Pressure 1\n"
              << "    Behind      : Speed 3, Mentality Attacking, Passing Tendency 3, Pressure 3, Aggression 3\n";

    // Substitutions: pick the 3 swaps that lose the fewest rating points, one per bench player
    // and per slot, so tired starters can come off around 60-70 minutes.
    std::vector<bool> starting(squad.size(), false), slotUsed(slots.size(), false);
    for (const Pick& p : r.picks) starting[p.player] = true;
    std::cout << "\n  SUBSTITUTIONS (3 allowed - bring them on around 60-70' as stamina drops)\n";
    for (int round = 0; round < 3; ++round) {
        int bestBench = -1, bestSlot = -1, bestRating = 0, bestDrop = std::numeric_limits<int>::max();
        for (size_t b = 0; b < squad.size(); ++b) {
            if (starting[b]) continue;
            for (size_t s = 0; s < slots.size(); ++s) {
                if (slotUsed[s] || slots[s] == "GK") continue;   // never plan to sub the keeper
                int rating = ratingAt(squad[b], slots[s]).rating;
                int drop = r.picks[s].rating - rating;
                if (drop < bestDrop) {
                    bestDrop = drop; bestBench = static_cast<int>(b);
                    bestSlot = static_cast<int>(s); bestRating = rating;
                }
            }
        }
        if (bestBench < 0) break;                              // bench is empty
        starting[bestBench] = true;                            // don't use the same sub twice
        slotUsed[bestSlot] = true;
        std::cout << "    " << std::left << std::setw(12) << squad[bestBench].name << " on for "
                  << std::setw(12) << squad[r.picks[bestSlot].player].name << " at " << std::setw(4) << slots[bestSlot]
                  << " (" << bestRating << " vs " << r.picks[bestSlot].rating << ")\n";
    }

    // Point out the weakest slot - that's the first thing to upgrade.
    for (size_t s = 0; s < slots.size(); ++s) {
        if (r.picks[s].rating == r.weakest) {
            std::cout << "\n  Weak link: " << squad[r.picks[s].player].name << " at " << slots[s]
                      << " (" << r.weakest << ") - upgrade this position first.\n";
            break;                                     // break = leave the loop now
        }
    }
}

void printUsage() {
    std::cout << "Usage: fc_strategy [--style any|attack|balanced|defend] [--top N] [--alt-penalty N]\n"
                 "                   [--players players.txt] [--formations formations.txt]\n";
}

// -----------------------------------------------------------------------------
// LESSON 15 - main(): where every C++ program starts
// argc = how many command-line words, argv = the words themselves.
// Returning 0 means "success"; anything else means "something went wrong".
// -----------------------------------------------------------------------------
int main(int argc, char* argv[]) {
    std::string playersFile = "players.txt";
    std::string formationsFile = "formations.txt";
    std::string style = "any";
    int top = 10;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        bool hasValue = i + 1 < argc;
        if (arg == "--style" && hasValue)           style = argv[++i];   // ++i: move to the next word first
        else if (arg == "--top" && hasValue)        top = std::atoi(argv[++i]);
        else if (arg == "--alt-penalty" && hasValue) gAlternatePenalty = std::atoi(argv[++i]);
        else if (arg == "--players" && hasValue)    playersFile = argv[++i];
        else if (arg == "--formations" && hasValue) formationsFile = argv[++i];
        else { printUsage(); return 1; }
    }
    if (style != "any" && style != "attack" && style != "balanced" && style != "defend") {
        printUsage();
        return 1;
    }

    std::vector<Player> squad;
    std::vector<Formation> formations;
    try {
        squad = loadPlayers(playersFile);
        formations = loadFormations(formationsFile);
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }
    if (squad.size() < 11) {
        std::cerr << "Error: need at least 11 players, found " << squad.size() << "\n";
        return 1;
    }

    // Evaluate every formation.
    std::vector<Result> results;
    for (const Formation& f : formations) results.push_back(evaluate(f, squad, style));

    // LESSON 16 - sorting with a custom rule (another lambda).
    // The lambda answers "should a come before b?" - here: higher score first; on a tie,
    // formations the game tags "Recommended" first. stable_sort (unlike sort) keeps tied
    // entries in their file order, so the result is the same every run.
    auto recommended = [](const Result& r) { return r.formation->tags.find("Recommended") != std::string::npos; };
    std::stable_sort(results.begin(), results.end(), [&](const Result& a, const Result& b) {
        if (a.score != b.score) return a.score > b.score;
        return recommended(a) && !recommended(b);
    });

    std::cout << "\nSquad: " << squad.size() << " players   Formations: " << formations.size()
              << "   Style preference: " << style << "\n\n";

    // Ranking table. setw(n) pads the next value to n characters; left aligns it.
    std::cout << std::left << std::setw(4) << "#" << std::setw(19) << "Formation"
              << std::setw(8) << "Score" << std::setw(8) << "Avg" << std::setw(9) << "Weakest"
              << "Game tags\n";
    std::cout << std::string(75, '-') << "\n";
    int shown = std::min<int>(top, static_cast<int>(results.size()));
    for (int i = 0; i < shown; ++i) {
        const Result& r = results[i];
        std::cout << std::left << std::setw(4) << i + 1 << std::setw(19) << r.formation->name
                  << std::fixed << std::setprecision(2)
                  << std::setw(8) << r.score << std::setw(8) << r.average
                  << std::setw(9) << r.weakest << r.formation->tags << "\n";
    }

    // Detailed view of the winner.
    const Result& best = results[0];
    std::cout << "\n=== BEST FORMATION: " << best.formation->name << " ===\n";
    std::vector<bool> starting(squad.size(), false);
    for (size_t s = 0; s < best.picks.size(); ++s) {
        const Pick& p = best.picks[s];
        starting[p.player] = true;
        const Player& pl = squad[p.player];
        std::cout << "  " << std::left << std::setw(5) << best.formation->slots[s]
                  << std::setw(14) << pl.name << std::right << std::setw(4) << p.rating;
        if (best.formation->slots[s] != pl.mainPos) std::cout << "   (natural " << pl.mainPos << ")";
        if (p.alternate) std::cout << "  alt position";
        if (p.estimated) std::cout << "  *estimated";
        std::cout << "\n";
    }

    std::cout << "\n  Bench: ";
    bool first = true;
    for (size_t i = 0; i < squad.size(); ++i) {
        if (starting[i]) continue;
        std::cout << (first ? "" : ", ") << squad[i].name << " " << squad[i].mainPos << " " << squad[i].mainRating;
        first = false;
    }
    std::cout << "\n";

    printStrategy(best, squad, style);
    std::cout << "\n  * = rating not shown in your screenshots; estimated from pitch distance.\n";
    return 0;
}
