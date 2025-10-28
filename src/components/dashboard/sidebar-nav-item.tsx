"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  type ReactSVGElement,
  forwardRef,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type SidebarNavItemElement = ElementRef<typeof Link>;
type SidebarNavItemProps = ComponentPropsWithoutRef<typeof Link> & {
  icon?: ReactElement<ReactSVGElement>;
  isActive?: boolean;
};

export const SidebarNavItem = forwardRef<
  SidebarNavItemElement,
  SidebarNavItemProps
>((props, ref) => {
  const { icon, className, children, href, isActive, ...otherProps } = props;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  let isCurrentPage = false;

  if (typeof isActive === "boolean") {
    isCurrentPage = isActive;
  } else {
    const hrefString =
      typeof href === "string"
        ? href
        : href && "pathname" in href && href.pathname
          ? [
              href.pathname,
              href.query
                ? new URLSearchParams(
                    Object.entries(href.query).reduce<Record<string, string>>(
                      (acc, [key, value]) => {
                        if (typeof value === "undefined") {
                          return acc;
                        }
                        acc[key] = Array.isArray(value)
                          ? value.join(",")
                          : String(value);
                        return acc;
                      },
                      {},
                    ),
                  ).toString()
                : null,
            ]
              .filter(Boolean)
              .join("?")
          : "";

    if (hrefString) {
      const [targetPathWithQuery] = hrefString.split("#");
      const [targetPath, targetQuery] = targetPathWithQuery.split("?");

      const matchesPath = pathname === targetPath;

      let matchesQuery = true;
      if (targetQuery) {
        const targetSearch = new URLSearchParams(targetQuery);
        matchesQuery = Array.from(targetSearch.entries()).every(
          ([key, value]) => searchParams.get(key) === value,
        );
      }

      isCurrentPage = matchesPath && matchesQuery;
    }
  }

  return (
    <li>
      <Link
        ref={ref}
        href={href}
        className={cn(
          "group flex w-full items-center gap-3 rounded-md px-4 py-2 transition-colors focus:outline-none focus-visible:bg-surface-700/10 focus-visible:text-surface-900 [&_svg]:shrink-0",
          isCurrentPage &&
            "bg-surface-700/10 font-medium text-primary [&_svg]:text-primary",

          !isCurrentPage &&
            "text-surface-700 hover:bg-surface-700/10 hover:text-surface-900 [&_svg]:text-surface-500",
          className,
        )}
        {...otherProps}
      >
        {icon}
        {children ? <span>{children}</span> : null}
        <ChevronRightIcon
          className="ml-auto opacity-60"
          aria-hidden
          size="16"
        />
      </Link>
    </li>
  );
});
