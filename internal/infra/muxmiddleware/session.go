package muxmiddleware

import "net/http"

// TransportSession moves X-Gripmock-Session into internal context and strips the header.
func TransportSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		consumed, resetHint := ConsumeRequestWithResetHint(r)
		if resetHint {
			w.Header().Set(ResetHeaderName, "1")
		}

		next.ServeHTTP(w, consumed)
	})
}
