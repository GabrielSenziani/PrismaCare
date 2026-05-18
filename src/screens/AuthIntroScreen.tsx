import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ColorPalette } from '../theme/colors';
import { useColors } from '../contexts/AccessibilityContext';
import { persistAuthIntroSeen } from '../services/appPreferences';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AuthIntro'>;
};

const SLIDES = [
  {
    icon: 'time-outline',
    title: 'Lembretes no horário certo',
    text: 'Organize a rotina de medicamentos com clareza, sem misturar cadastro com lembrete.',
  },
  {
    icon: 'people-outline',
    title: 'Pessoas de confiança por perto',
    text: 'Mantenha contatos importantes acessíveis para momentos em que apoio faz diferença.',
  },
] as const;

export default function AuthIntroScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(18)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    void persistAuthIntroSeen();

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [fade, lift, pulse]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });

  const heroTranslateX = scrollX.interpolate({
    inputRange: [0, width, width * 2],
    outputRange: [0, -34, -52],
    extrapolate: 'clamp',
  });

  const heroScale = scrollX.interpolate({
    inputRange: [0, width, width * 2],
    outputRange: [1, 0.92, 0.88],
    extrapolate: 'clamp',
  });

  function irParaProximoSlide() {
    scrollRef.current?.scrollTo({ x: width, animated: true });
  }

  function irParaSlide(posicao: number) {
    scrollRef.current?.scrollTo({ x: width * posicao, animated: true });
  }

  return (
    <LinearGradient
      colors={['#DDF7EC', colors.gradientStart, colors.gradientMid, colors.primaryDeep]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.66)', 'rgba(255,255,255,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.7, y: 0.7 }}
        style={styles.topGlow}
      />
      <Animated.View style={[styles.halo, styles.haloLarge, { transform: [{ scale: pulseScale }] }]} />
      <Animated.View style={[styles.halo, styles.haloSmall, { transform: [{ scale: pulseScale }] }]} />

      <SafeAreaView style={styles.safe}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true },
          )}
        >
          <Animated.View
            style={[
              styles.slide,
              { width, opacity: fade, transform: [{ translateY: lift }] },
            ]}
          >
            <Animated.View
              style={[
                styles.heroVisual,
                { transform: [{ translateX: heroTranslateX }, { scale: heroScale }] },
              ]}
            >
              <Animated.View style={[styles.logoBadge, { transform: [{ scale: pulseScale }] }]}>
                <Image source={require('../../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
              </Animated.View>

              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <View style={styles.previewIcon}>
                    <Ionicons name="medkit-outline" size={20} color={colors.primaryDeep} />
                  </View>
                  <View style={styles.previewTextBlock}>
                    <Text style={styles.previewTitle}>Losartana</Text>
                    <Text style={styles.previewSub}>Hoje às 08:00</Text>
                  </View>
                  <View style={styles.previewStatus}>
                    <Ionicons name="checkmark" size={14} color={colors.primaryDeep} />
                  </View>
                </View>
                <View style={styles.progressTrack}>
                  <View style={styles.progressFill} />
                </View>
              </View>
            </Animated.View>

            <View style={styles.copy}>
              <Text style={styles.brand}>PrismaCare</Text>
              <Text style={styles.title}>Seu cuidado organizado com leveza</Text>
              <Text style={styles.subtitle}>
                Acompanhe medicamentos, doses e contatos importantes em um só lugar.
              </Text>
            </View>

            <TouchableOpacity style={styles.swipeHint} activeOpacity={0.82} onPress={irParaProximoSlide}>
              <Text style={styles.swipeText}>Arraste para conhecer</Text>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.86)" />
            </TouchableOpacity>
          </Animated.View>

          {SLIDES.map((slide, index) => {
            const inputStart = width * index;
            const inputEnd = width * (index + 1);
            const cardOpacity = scrollX.interpolate({
              inputRange: [inputStart, inputEnd, inputEnd + width],
              outputRange: [0, 1, 0.88],
              extrapolate: 'clamp',
            });
            const cardTranslate = scrollX.interpolate({
              inputRange: [inputStart, inputEnd, inputEnd + width],
              outputRange: [36, 0, -18],
              extrapolate: 'clamp',
            });
            const isLast = index === SLIDES.length - 1;

            return (
              <View key={slide.title} style={[styles.slide, { width }]}>
                <Animated.View
                  style={[
                    styles.featureCard,
                    {
                      opacity: cardOpacity,
                      transform: [{ translateX: cardTranslate }],
                    },
                  ]}
                >
                  <View style={styles.featureIcon}>
                    <Ionicons name={slide.icon} size={34} color={colors.primaryDeep} />
                  </View>
                  <Text style={styles.featureTitle}>{slide.title}</Text>
                  <Text style={styles.featureText}>{slide.text}</Text>

                  {isLast ? (
                    <TouchableOpacity
                      style={styles.primaryButton}
                      activeOpacity={0.88}
                      onPress={() => navigation.navigate('AuthEntry')}
                    >
                      <Text style={styles.primaryText}>Começar</Text>
                      <Ionicons name="arrow-forward" size={20} color={colors.primaryDeep} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.inlineHint}
                      activeOpacity={0.82}
                      onPress={() => irParaSlide(index + 2)}
                    >
                      <Text style={styles.inlineHintText}>Continue arrastando</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.primaryDeep} />
                    </TouchableOpacity>
                  )}
                </Animated.View>
              </View>
            );
          })}
        </Animated.ScrollView>

        <View style={styles.dots}>
          {[0, 1, 2].map((index) => {
            const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
            const dotScaleX = scrollX.interpolate({
              inputRange,
              outputRange: [1, 3, 1],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.36, 1, 0.36],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    opacity: dotOpacity,
                    transform: [{ scaleX: dotScaleX }],
                  },
                ]}
              />
            );
          })}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 330,
  },
  halo: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  haloLarge: {
    width: 300,
    height: 300,
    top: (StatusBar.currentHeight ?? 0) + 42,
    right: -96,
  },
  haloSmall: {
    width: 190,
    height: 190,
    bottom: 112,
    left: -68,
  },
  safe: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroVisual: {
    width: '100%',
    minHeight: 252,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadge: {
    width: 126,
    height: 126,
    borderRadius: 30,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 2,
  },
  logoImage: {
    width: '84%',
    height: '84%',
  },
  previewCard: {
    width: '86%',
    minHeight: 92,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 16,
    marginTop: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  previewTextBlock: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  previewSub: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  previewStatus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DDF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    width: '68%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  copy: {
    alignItems: 'center',
    marginTop: 18,
  },
  brand: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 10,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'center',
    marginTop: 14,
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 30,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  swipeText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '800',
  },
  featureCard: {
    width: '100%',
    minHeight: 420,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.88)',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 9,
  },
  featureIcon: {
    width: 86,
    height: 86,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  featureTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  featureText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 14,
  },
  inlineHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 18,
    marginTop: 30,
  },
  inlineHintText: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontWeight: '900',
  },
  primaryButton: {
    height: 58,
    minWidth: 190,
    borderRadius: 18,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 34,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryText: {
    color: colors.primaryDeep,
    fontSize: 16,
    fontWeight: '900',
  },
  dots: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
});
