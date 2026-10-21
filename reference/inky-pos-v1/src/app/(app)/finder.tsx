// src/app/(app)/finder.tsx
import { useFocusEffect, useRouter } from "expo-router";
import {
    ArrowLeft,
    Compass,
    MapPin,
    MessageSquare,
    Phone,
    Search,
} from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { generateUUID, getDatabase } from "../../db/sqlite";
import { usePortalTypeGuard } from "../../utils/portalGuard";

interface FinderListing {
  id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  whatsapp: string;
  opening_hours: string;
  description: string;
  rating: number;
}

export default function FinderScreen() {
  usePortalTypeGuard(["company"]);

  const router = useRouter();
  const dbPromise = getDatabase();

  const [activeTab, setActiveTab] = useState<"profile" | "explore">("explore");
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState<
    | "retail"
    | "bar"
    | "restaurant"
    | "pharmacy"
    | "hardware"
    | "salon"
    | "grocery"
    | "other"
  >("retail");

  const [whatsapp, setWhatsapp] = useState("+263771112233");
  const [hours, setHours] = useState("08:00 - 17:00");
  const [desc, setDesc] = useState("Local SME retail convenience store.");
  const [lat, setLat] = useState("-17.8248");
  const [lng, setLng] = useState("31.0530"); // Harare coordinates

  const [searchQuery, setSearchQuery] = useState("");
  const [listings, setListings] = useState<FinderListing[]>([]);

  // Load Finder profile and directory listings
  const loadFinderData = async () => {
    try {
      const db = await dbPromise;

      // 1. Fetch our own business listing
      const ownListing = await db.getAllAsync<any>(
        "SELECT * FROM inky_finder_listings LIMIT 1;",
      );

      if (ownListing.length > 0) {
        const row = ownListing[0];
        setIsPublic(row.is_public === 1);
        setCategory(row.category);
        setWhatsapp(row.whatsapp || "");
        setHours(row.opening_hours || "");
        setDesc(row.description || "");
        setLat(String(row.latitude || "-17.8248"));
        setLng(String(row.longitude || "31.0530"));
      }

      // 2. Fetch all public directories listings
      const list = await db.getAllAsync<any>(
        "SELECT * FROM inky_finder_listings WHERE business_id != 'system_own' AND is_public = 1;",
      );

      // If empty, seed a couple of public business listings for discovery simulation
      if (list.length === 0) {
        const now = new Date().toISOString();
        const demoListings = [
          {
            id: generateUUID(),
            name: "Avondale Pharmacy",
            cat: "pharmacy",
            addr: "Shop 12 Avondale Plaza, Harare",
            phone: "+263242333444",
            wa: "+263772111222",
            hours: "08:00 - 20:00",
            desc: "Emergency health supplements and medicines.",
          },
          {
            id: generateUUID(),
            name: "Chipo Boutique & Salons",
            cat: "salon",
            addr: "Fife Avenue Shops, Harare",
            phone: "+263242777888",
            wa: "+263773444555",
            hours: "09:00 - 18:00",
            desc: "Premium hair weave attachments and styling.",
          },
          {
            id: generateUUID(),
            name: "Mbare Hardware Depot",
            cat: "hardware",
            addr: "Mbare Musika Market, Harare",
            phone: "+263784111333",
            wa: "+263784111333",
            hours: "07:00 - 16:30",
            desc: "Wholesale roofing sheets and steel tubing.",
          },
        ];

        for (const dl of demoListings) {
          await db.runAsync(
            `INSERT INTO inky_finder_listings (id, business_id, name, category, latitude, longitude, address, phone, whatsapp, opening_hours, logo_url, description, is_public, rating, ratings_count, sync_status, created_at, updated_at)
             VALUES (?, 'demo_biz_uuid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 4.5, 12, 'synced', ?, ?);`,
            [
              dl.id,
              dl.name,
              dl.cat,
              -17.82 + Math.random() * 0.05,
              31.05 + Math.random() * 0.05,
              dl.addr,
              dl.phone,
              dl.wa,
              dl.hours,
              "https://via.placeholder.com/50",
              dl.desc,
              now,
              now,
            ],
          );
        }

        // Re-query
        const refreshedList = await db.getAllAsync<any>(
          "SELECT * FROM inky_finder_listings WHERE is_public = 1;",
        );
        setListings(refreshedList);
      } else {
        setListings(list);
      }
    } catch (err) {
      console.error("Failed to load Inky Finder directory:", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadFinderData();
    }, []),
  );

  // Save Listing details to local database
  const handleSaveProfile = async () => {
    try {
      const db = await dbPromise;
      const now = new Date().toISOString();

      // Check if listing already exists
      const own = await db.getAllAsync<any>(
        "SELECT id FROM inky_finder_listings WHERE business_id = 'system_own' LIMIT 1;",
      );

      if (own.length > 0) {
        await db.runAsync(
          `UPDATE inky_finder_listings 
           SET is_public = ?, category = ?, whatsapp = ?, opening_hours = ?, description = ?, latitude = ?, longitude = ?, updated_at = ?
           WHERE business_id = 'system_own';`,
          [
            isPublic ? 1 : 0,
            category,
            whatsapp,
            hours,
            desc,
            parseFloat(lat) || -17.82,
            parseFloat(lng) || 31.05,
            now,
          ],
        );
      } else {
        await db.runAsync(
          `INSERT INTO inky_finder_listings (id, business_id, name, category, latitude, longitude, address, phone, whatsapp, opening_hours, logo_url, description, is_public, rating, ratings_count, sync_status, created_at, updated_at)
           VALUES (?, 'system_own', 'Harare Mega Mart', ?, ?, ?, '101 Leopold Takawira St, Harare', '+263242123456', ?, ?, 'https://via.placeholder.com/150', ?, ?, 5.0, 1, 'pending_insert', now, now);`,
          [
            generateUUID(),
            category,
            parseFloat(lat) || -17.82,
            parseFloat(lng) || 31.05,
            whatsapp,
            hours,
            desc,
            isPublic ? 1 : 0,
            now,
            now,
          ],
        );
      }

      Alert.alert("Saved", "Inky Finder public profile configured.");
      loadFinderData();
    } catch (err) {
      console.error("Failed to write finder profile:", err);
      Alert.alert("Error", "Failed to save configuration details.");
    }
  };

  // Filter listings based on search
  const filteredListings = listings.filter((l) => {
    return (
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <View className="bg-primary px-4 py-3.5 flex-row items-center space-x-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1 active:opacity-75"
        >
          <ArrowLeft color="#FFFFFF" size={20} />
        </TouchableOpacity>
        <Text className="text-base font-extrabold text-white">
          Inky Finder Directory
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-white border-b border-slate-200">
        {[
          { key: "explore", label: "Explore Directory", icon: Compass },
          { key: "profile", label: "My Public Listing", icon: MapPin },
        ].map((tab) => {
          const isSelected = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-3 items-center flex-row justify-center space-x-2 border-b-2 ${
                isSelected ? "border-primary bg-slate-50" : "border-transparent"
              }`}
            >
              <Icon color={isSelected ? "#0A2540" : "#94A3B8"} size={15} />
              <Text
                className={`text-xs font-bold ${
                  isSelected ? "text-primary" : "text-slate-500"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <View className="flex-1">
        {/* TAB 1: Explore public listings */}
        {activeTab === "explore" && (
          <View className="flex-1">
            <View className="p-3 bg-white border-b border-slate-200 flex-row items-center px-4">
              <Search color="#94A3B8" size={18} />
              <TextInput
                placeholder="Search bars, hardware, pharmacy nearby..."
                className="text-sm text-slate-800 ml-2 flex-1 p-0"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <ScrollView
              className="flex-1 p-3"
              contentContainerStyle={{ paddingBottom: 90 }}
            >
              {filteredListings.map((item) => (
                <Card key={item.id} className="mb-3">
                  <CardContent className="p-4">
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1 pr-4">
                        <Text className="text-sm font-bold text-slate-800 dark:text-white">
                          {item.name}
                        </Text>
                        <Badge
                          label={item.category.toUpperCase()}
                          variant="default"
                          className="mt-1 px-1.5 py-0.5"
                        />
                        <Text
                          className="text-xs text-slate-500 mt-2"
                          numberOfLines={2}
                        >
                          {item.description}
                        </Text>

                        <View className="flex-row items-center mt-3 text-slate-400">
                          <MapPin size={12} color="#94A3B8" />
                          <Text
                            className="text-[10px] text-slate-400 ml-1"
                            numberOfLines={1}
                          >
                            {item.address}
                          </Text>
                        </View>
                      </View>

                      {/* Contacts triggers */}
                      <View className="items-end">
                        <Badge
                          label="★ 4.5"
                          variant="secondary"
                          className="px-1.5 py-0.5"
                        />
                        <Text className="text-[9px] text-slate-400 mt-1">
                          {item.opening_hours}
                        </Text>

                        <View className="flex-row mt-4 space-x-2">
                          <TouchableOpacity
                            onPress={() =>
                              Alert.alert("Calling", `Dialing ${item.phone}...`)
                            }
                            className="bg-slate-100 p-2 rounded-lg"
                          >
                            <Phone size={12} color="#0A2540" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              Alert.alert(
                                "WhatsApp Chat",
                                `Opening chat thread with ${item.whatsapp}...`,
                              )
                            }
                            className="bg-emerald-100 p-2 rounded-lg"
                          >
                            <MessageSquare size={12} color="#15B754" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </CardContent>
                </Card>
              ))}
            </ScrollView>
          </View>
        )}

        {/* TAB 2: Edit public profile listing */}
        {activeTab === "profile" && (
          <ScrollView
            className="flex-1 p-5"
            contentContainerStyle={{ paddingBottom: 90 }}
          >
            <Card className="p-5 mb-6">
              <View className="flex-row justify-between items-center mb-5 pb-3 border-b border-slate-100">
                <View>
                  <Text className="text-sm font-bold text-slate-800">
                    Publish Listing Publicly
                  </Text>
                  <Text className="text-[10px] text-slate-400">
                    Appear on the Zimbabwe discovery map.
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  trackColor={{ false: "#CBD5E1", true: "#00C853" }}
                />
              </View>

              {/* Category picker */}
              <View className="mb-4">
                <Text className="text-sm font-semibold text-slate-700 mb-1.5">
                  Listing Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[
                    "retail",
                    "bar",
                    "restaurant",
                    "pharmacy",
                    "hardware",
                    "salon",
                    "grocery",
                    "other",
                  ].map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCategory(c as any)}
                      className={`py-1.5 px-3 rounded-lg mr-2 border ${
                        category === c
                          ? "bg-primary border-primary"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          category === c
                            ? "text-white font-bold"
                            : "text-slate-600"
                        }`}
                      >
                        {c.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Input
                label="WhatsApp Contact *"
                placeholder="+263771112233"
                value={whatsapp}
                onChangeText={setWhatsapp}
              />

              <Input
                label="Opening Hours"
                placeholder="e.g. 08:00 - 18:00"
                value={hours}
                onChangeText={setHours}
              />

              <Input
                label="Public Business Bio *"
                placeholder="Provide a bio of products and services offered..."
                value={desc}
                onChangeText={setDesc}
              />

              <View className="flex-row flex-wrap justify-between mb-4">
                <Input
                  label="GPS Latitude"
                  placeholder="-17.8248"
                  className="w-full sm:w-[48%]"
                  value={lat}
                  onChangeText={setLat}
                />
                <Input
                  label="GPS Longitude"
                  placeholder="31.0530"
                  className="w-full sm:w-[48%]"
                  value={lng}
                  onChangeText={setLng}
                />
              </View>

              <Button
                label="Update Listing Profile"
                onPress={handleSaveProfile}
                variant="primary"
                className="w-full mt-2"
              />
            </Card>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
