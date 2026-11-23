// The places an access point can be in. Same list as `Location` in the
// backend (app/schemas.py), which rejects any other value. Each one has a
// translation: locations.<code> in es.json / en.json.
export const LOCATIONS = [
  "main_entrance",
  "library",
  "physics_lab",
  "computer_lab",
  "chemistry_lab",
  "auditorium",
];
