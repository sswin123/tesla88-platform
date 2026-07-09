import ProfileCard from '@/app/components/ProfileCard';
import SettingsList from '@/app/components/SettingsList';

/* Middleware handles unauthenticated redirect to /login */
export default function ProfilePage() {
  return (
    <div className="max-w-lg mx-auto lg:mx-0 flex flex-col gap-4">
      <ProfileCard />
      <SettingsList />
    </div>
  );
}
