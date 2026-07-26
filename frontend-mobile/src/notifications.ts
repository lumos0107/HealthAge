/**
 * 검진 리마인더 — 로컬 예약 알림.
 *
 * 왜 로컬인가: 원격 푸시는 서버·인증서·Expo Go 제약이 따라붙는데, 우리가 알려야 할 건
 * "다음 검진 시기" 하나뿐이고 그 날짜는 앱이 이미 알고 있다. 서버가 필요 없다.
 * (Expo Go는 SDK 53+에서 원격 푸시를 지원하지 않지만 로컬 알림은 동작한다.)
 *
 * 알림 시점: 권장 검진 연도의 1월 second week 아침. 검진은 연 단위 권장이라
 * 날짜를 정확히 특정할 수 없어 "그 해가 시작될 때" 한 번 알린다.
 * 이미 지난 시기면 즉시성 있게 곧 알린다(놓친 검진을 조용히 넘기지 않는다).
 */
import * as Notifications from 'expo-notifications';
import { LogBox, Platform } from 'react-native';

// Expo Go는 SDK 53부터 '원격' 푸시를 지원하지 않아 import만으로도 빨간 에러 토스트를 띄운다.
// 우리는 로컬 예약 알림만 쓰므로 이 안내는 해당되지 않는다 — 시연 화면을 가리므로 가린다.
// (개발 빌드/스토어 빌드에서는 애초에 나오지 않는 메시지다.)
LogBox.ignoreLogs([
  /expo-notifications: Android Push notifications \(remote notifications\)/,
  /`expo-notifications` functionality is not fully supported in Expo Go/,
]);

// 앱이 켜져 있을 때도 배너를 보여준다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const CHECKUP_ID = 'checkup-reminder';

/** 알림 권한 요청. 거부되면 false — 호출 측에서 토글을 되돌린다. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** 예약된 검진 리마인더를 모두 지운다(토글 OFF·재예약 전 정리). */
export async function cancelCheckupReminder(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.kind === CHECKUP_ID)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * 다음 검진 연도에 맞춰 알림을 예약한다.
 *
 * @param nextExamYear 백엔드 insight.next_exam_year / exam_pattern이 준 권장 연도
 * @param now          기준 시각(테스트에서 주입). 기본값은 현재 시각.
 * @returns 예약된 시각. 예약하지 않았으면 null.
 */
export async function scheduleCheckupReminder(
  nextExamYear: number | null | undefined,
  now: Date = new Date(),
): Promise<Date | null> {
  if (!nextExamYear) return null;
  if (!(await ensureNotificationPermission())) return null;

  await cancelCheckupReminder();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('checkup', {
      name: '검진 일정',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // 권장 연도 1월 10일 오전 9시. 이미 지났으면 1분 뒤에 알려 "지금이 검진 시기"임을 알린다.
  let target = new Date(nextExamYear, 0, 10, 9, 0, 0);
  const overdue = target.getTime() <= now.getTime();
  if (overdue) target = new Date(now.getTime() + 60 * 1000);

  await Notifications.scheduleNotificationAsync({
    identifier: `${CHECKUP_ID}-${nextExamYear}`,
    content: {
      title: overdue ? '건강검진 시기가 되었어요' : `${nextExamYear}년 건강검진 시기예요`,
      body: overdue
        ? `권장 검진 연도(${nextExamYear}년)가 지났어요. 국가건강검진 대상인지 확인해보세요.`
        : '올해 국가건강검진 대상이에요. 결과지를 받으면 앱에 올려 변화를 이어서 보세요.',
      data: { kind: CHECKUP_ID, year: nextExamYear },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: target,
      channelId: Platform.OS === 'android' ? 'checkup' : undefined,
    },
  });

  return target;
}

/** 지금 예약돼 있는 검진 리마인더 시각(없으면 null) — 설정 화면에 보여준다. */
export async function getScheduledCheckupReminder(): Promise<Date | null> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const mine = scheduled.find((n) => n.content.data?.kind === CHECKUP_ID);
  if (!mine) return null;
  const t: any = mine.trigger;
  // DATE 트리거는 플랫폼에 따라 value(ms) 또는 date로 온다.
  const ms = typeof t?.value === 'number' ? t.value : (t?.date ? new Date(t.date).getTime() : null);
  return ms ? new Date(ms) : null;
}
