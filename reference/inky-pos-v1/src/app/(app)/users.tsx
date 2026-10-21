// src/app/(app)/users.tsx
import { useFocusEffect, useRouter } from "expo-router";
import { Trash2, UserPlus } from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    FlatList,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { User as UserSchema } from "../../db/schema";
import { generateUUID, getDatabase } from "../../db/sqlite";
import { useAuthStore } from "../../store/useAuthStore";
import { usePortalRouteGuard } from "../../utils/portalGuard";

const roleOptions = [
  "company_owner",
  "general_manager",
  "store_manager",
  "cashier",
  "inventory_clerk",
  "accountant",
  "auditor",
  "admin",
  "manager",
  "operator",
  "finance",
];

export default function UsersScreen() {
  usePortalRouteGuard(["settings"]);

  const router = useRouter();
  const dbPromise = getDatabase();
  const { user } = useAuthStore();

  const [users, setUsers] = useState<UserSchema[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSchema | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("operator");
  const [pin, setPin] = useState("");

  const loadUsers = async () => {
    try {
      const db = await dbPromise;
      const savedUsers = await db.getAllAsync<UserSchema>(
        "SELECT * FROM users ORDER BY created_at DESC;",
      );
      setUsers(savedUsers);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadUsers();
    }, []),
  );

  const clearForm = () => {
    setSelectedUser(null);
    setEmail("");
    setFullName("");
    setRole("operator");
    setPin("");
  };

  const handleSaveUser = async () => {
    if (!email || !fullName || !role || (!selectedUser && pin.length < 4)) {
      Alert.alert("Invalid Input", "Please fill all required fields.");
      return;
    }

    try {
      const db = await dbPromise;
      const now = new Date().toISOString();
      const userId = selectedUser?.id ?? generateUUID();
      const pinCode = selectedUser?.pin_code ?? "0000";

      if (selectedUser) {
        await db.runAsync(
          `UPDATE users SET email = ?, role = ?, full_name = ?, updated_at = ? WHERE id = ?;`,
          [email.trim().toLowerCase(), role, fullName, now, userId],
        );
      } else {
        await db.runAsync(
          `INSERT INTO users (id, business_id, email, password_hash, pin_code, role, full_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            userId,
            user?.business_id || "",
            email.trim().toLowerCase(),
            "hashed_password_placeholder",
            pin,
            role,
            fullName,
            now,
            now,
          ],
        );
      }

      Alert.alert(
        "Saved",
        `User ${selectedUser ? "updated" : "created"} successfully.`,
      );
      clearForm();
      loadUsers();
    } catch (err) {
      console.error("Failed to save user:", err);
      Alert.alert("Error", "Could not save user.");
    }
  };

  const handleEditUser = (userItem: UserSchema) => {
    setSelectedUser(userItem);
    setEmail(userItem.email);
    setFullName(userItem.full_name);
    setRole(userItem.role);
    setPin("");
  };

  const handleDeleteUser = async (userItem: UserSchema) => {
    Alert.alert(
      "Delete User",
      `Delete ${userItem.full_name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await dbPromise;
              await db.runAsync("DELETE FROM users WHERE id = ?;", [
                userItem.id,
              ]);
              loadUsers();
            } catch (err) {
              console.error("Failed to delete user:", err);
              Alert.alert("Error", "Could not delete user.");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View className="mb-6 flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-slate-900 dark:text-white">
              User Management
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Create, update, and delete POS users for your company.
            </Text>
          </View>
          <TouchableOpacity
            onPress={clearForm}
            className="bg-primary px-4 py-2 rounded-2xl"
          >
            <Text className="text-white font-semibold">New User</Text>
          </TouchableOpacity>
        </View>

        <Card className="mb-6">
          <CardContent className="p-5 space-y-4">
            <Input
              label="Email Address"
              placeholder="user@inkypos.co.zw"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="Full Name"
              placeholder="Jane Doe"
              value={fullName}
              onChangeText={setFullName}
            />
            <Input
              label="Role"
              placeholder="operator"
              value={role}
              onChangeText={setRole}
              helperText="Use one of the standard role keys."
            />
            {!selectedUser && (
              <Input
                label="PIN Code"
                placeholder="0000"
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={pin}
                onChangeText={setPin}
              />
            )}
            <View className="flex-row justify-between space-x-3">
              <Button
                label={selectedUser ? "Update User" : "Create User"}
                onPress={handleSaveUser}
                variant="secondary"
                className="flex-1"
              />
              <Button
                label="Reset"
                onPress={clearForm}
                variant="outline"
                className="flex-1"
              />
            </View>
          </CardContent>
        </Card>

        <Text className="text-xs uppercase tracking-[0.25em] text-slate-400 mb-3">
          Active users
        </Text>
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Card className="mb-3 border border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-slate-900 dark:text-white">
                      {item.full_name}
                    </Text>
                    <Text className="text-sm text-slate-500 dark:text-slate-400">
                      {item.email}
                    </Text>
                    <Text className="text-xs text-slate-400 mt-1">
                      Role: {item.role}
                    </Text>
                  </View>
                  <View className="flex-row space-x-2">
                    <TouchableOpacity
                      onPress={() => handleEditUser(item)}
                      className="bg-primary/10 px-3 py-2 rounded-2xl"
                    >
                      <UserPlus color="#0A2540" size={18} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteUser(item)}
                      className="bg-red-500/10 px-3 py-2 rounded-2xl"
                    >
                      <Trash2 color="#DC2626" size={18} />
                    </TouchableOpacity>
                  </View>
                </View>
              </CardContent>
            </Card>
          )}
          ListEmptyComponent={() => (
            <Text className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
              No users found yet.
            </Text>
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
