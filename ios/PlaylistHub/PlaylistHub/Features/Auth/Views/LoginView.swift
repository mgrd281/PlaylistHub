import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var authManager: AuthManager

    @State private var email = ""
    @State private var password = ""
    @State private var isSignUp = false
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 36) {
                Spacer().frame(height: 32)

                // Logo
                VStack(spacing: 14) {
                    ZStack {
                        Circle()
                            .fill(.red.opacity(0.1))
                            .frame(width: 72, height: 72)
                        Image(systemName: "play.rectangle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(.red)
                    }

                    Text("PlaylistHub")
                        .font(.system(size: 26, weight: .bold, design: .rounded))

                    Text(isSignUp ? "Create your account" : "Sign in to continue")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                // Form
                VStack(spacing: 14) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Email")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .padding(13)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 5) {
                        Text("Password")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                        SecureField("••••••••", text: $password)
                            .textContentType(isSignUp ? .newPassword : .password)
                            .focused($focusedField, equals: .password)
                            .padding(13)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    }
                }
                .padding(.horizontal, 24)

                if let error = authManager.error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }

                // Submit
                Button {
                    focusedField = nil
                    Task {
                        if isSignUp { await authManager.signUp(email: email, password: password) }
                        else { await authManager.signIn(email: email, password: password) }
                    }
                } label: {
                    Group {
                        if authManager.isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text(isSignUp ? "Create Account" : "Sign In")
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(canSubmit ? .red : .red.opacity(0.4))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .disabled(!canSubmit || authManager.isLoading)
                .padding(.horizontal, 24)

                // Toggle
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isSignUp.toggle()
                        authManager.error = nil
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(isSignUp ? "Already have an account?" : "Don't have an account?")
                            .foregroundStyle(.secondary)
                        Text(isSignUp ? "Sign In" : "Sign Up")
                            .foregroundStyle(.red)
                            .fontWeight(.medium)
                    }
                    .font(.caption)
                }

                Spacer()
            }
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty
    }
}

#Preview {
    LoginView()
        .environmentObject(AuthManager.shared)
}
