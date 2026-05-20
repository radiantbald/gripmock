package features

// Flag is a feature toggle key.
type Flag int

// Toggles stores a set of enabled flags.
type Toggles map[Flag]struct{}

// New creates a toggles set with enabled flags.
func New(flags ...Flag) Toggles {
	toggles := make(Toggles, len(flags))
	for _, flag := range flags {
		toggles[flag] = struct{}{}
	}

	return toggles
}

// Has returns true when the flag is enabled.
func (t Toggles) Has(flag Flag) bool {
	_, ok := t[flag]

	return ok
}
