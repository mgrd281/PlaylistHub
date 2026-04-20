import SwiftUI

/// Allows users to set, verify, and manage a password that protects viewing raw stream URLs.
struct URLProtectionSettingsView: View {
    @EnvironmentObject private var themeManager: ThemeManager
    @StateObject private var urlProtection = URLProtectionManager.shared
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showSuccess = false
    @State private var mode: ViewMode = .check

    private var accent: Color { themeManager.accentColor }

    enum ViewMode {
        case check, setNew, verify, manage
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                // Header
                VStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(accent.opacity(0.12))
                            .frame(width: 64, height: 64)
                        Image(systemName: urlProtection.isProtected ? "lock.shield.fill" : "lock.open.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(accent)
                    }

                    Text(urlProtection.isProtected ? "URL Protection Active" : "Protect Your URLs")
                        .font(.headline)
                    Text("Set a password to control who can view raw stream and source URLs on this account.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                .padding(.top, 16)

                // Content based on state
                if urlProtection.isProtected && !urlProtection.isUnlocked {
                    verifySection
                } else if urlProtection.isProtected && urlProtection.isUnlocked {
                    manageSection
                } else {
                    setPasswordSection
                }

                // Error display
                if let error = urlProtection.error {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(.red)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    .padding(.horizontal, 20)
                }

                // Success feedback
                if showSuccess {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(.green)
                        Text("Success!")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.green)
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.bottom, 40)
        }
        .navigationTitle("URL Protection")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await urlProtection.checkStatus()
        }
    }

    // MARK: - Set Password

    private var setPasswordSection: some View {
        VStack(spacing: 12) {
            sectionCard {
                VStack(spacing: 12) {
                    SecureField("New password (min. 4 characters)", text: $password)
                        .textContentType(.newPassword)
                        .font(.subheadline)

                    Divider()

                    SecureField("Confirm password", text: $confirmPassword)
                        .textContentType(.newPassword)
                        .font(.subheadline)
                }
                .padding(14)
            }

            Button {
                Task {
                    if password.count < 4 {
                        urlProtection.error = "Password must be at least 4 characters"
                        return
                    }
                    if password != confirmPassword {
                        urlProtection.error = "Passwords don't match"
                        return
                    }
                    let success = await urlProtection.setPassword(password)
                    if success {
                        password = ""
                        confirmPassword = ""
                        withAnimation { showSuccess = true }
                        try? await Task.sleep(for: .seconds(2))
                        withAnimation { showSuccess = false }
                    }
                }
            } label: {
                HStack {
                    if urlProtection.isLoading {
                        ProgressView().tint(.white)
                    }
                    Text("Set Protection Password")
                        .font(.subheadline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(accent)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .disabled(urlProtection.isLoading || password.isEmpty || confirmPassword.isEmpty)
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Verify (Unlock)

    private var verifySection: some View {
        VStack(spacing: 12) {
            sectionCard {
                VStack(spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 12))
                            .foregroundStyle(.orange)
                        Text("Enter your protection password to unlock URL viewing")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .font(.subheadline)
                }
                .padding(14)
            }

            Button {
                Task {
                    let success = await urlProtection.verify(password)
                    if success {
                        password = ""
                        withAnimation { showSuccess = true }
                        try? await Task.sleep(for: .seconds(2))
                        withAnimation { showSuccess = false }
                    }
                }
            } label: {
                HStack {
                    if urlProtection.isLoading {
                        ProgressView().tint(.white)
                    }
                    Text("Unlock URLs")
                        .font(.subheadline.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(accent)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .disabled(urlProtection.isLoading || password.isEmpty)
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Manage (when unlocked)

    private var manageSection: some View {
        VStack(spacing: 12) {
            sectionCard {
                VStack(spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(.green)
                        Text("URLs are unlocked for this session")
                            .font(.subheadline.weight(.medium))
                        Spacer()
                    }

                    Divider()

                    Button {
                        urlProtection.lock()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 12))
                            Text("Lock Now")
                                .font(.caption.weight(.medium))
                        }
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(.orange.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                .padding(14)
            }

            // Change password
            sectionCard {
                VStack(spacing: 12) {
                    Text("Change Password")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    SecureField("New password", text: $password)
                        .textContentType(.newPassword)
                        .font(.subheadline)

                    Divider()

                    SecureField("Confirm new password", text: $confirmPassword)
                        .textContentType(.newPassword)
                        .font(.subheadline)

                    Button {
                        Task {
                            if password.count < 4 {
                                urlProtection.error = "Password must be at least 4 characters"
                                return
                            }
                            if password != confirmPassword {
                                urlProtection.error = "Passwords don't match"
                                return
                            }
                            let success = await urlProtection.setPassword(password)
                            if success {
                                password = ""
                                confirmPassword = ""
                                withAnimation { showSuccess = true }
                                try? await Task.sleep(for: .seconds(2))
                                withAnimation { showSuccess = false }
                            }
                        }
                    } label: {
                        Text("Update Password")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(accent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(accent.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(password.isEmpty || confirmPassword.isEmpty)
                }
                .padding(14)
            }

            // Remove protection
            Button {
                Task {
                    // Uses current unlocked session — still requires password for DELETE
                    // We'll prompt for it
                    // For simplicity, remove uses the last verified session
                    let success = await urlProtection.removeProtection(password.isEmpty ? "___" : password)
                    if success {
                        password = ""
                        confirmPassword = ""
                    }
                }
            } label: {
                Text("Remove Protection")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.red)
            }
            .padding(.top, 4)
        }
    }

    // MARK: - Section Card

    private func sectionCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .background(Color(.systemGray6).opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 20)
    }
}
